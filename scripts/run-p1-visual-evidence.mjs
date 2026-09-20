import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  assertCanonicalAcceptanceEvidence,
  assertHardwareGpu,
  summarizeGpuSystemInfo,
} from "./gpu-evidence.mjs";
import { launchP1Browser } from "./p1-browser.mjs";

const root = process.cwd();
const port = Number(process.env.P1_VISUAL_PORT ?? 4174);
const chromeExecutable = process.env.P1_CHROME_BIN ?? "chromium";
if (process.env.P1_VISUAL_HEADLESS === "true") {
  throw new Error("Canonical P1 evidence cannot be produced from a headless surface.");
}
const headless = false;
const requireHardware = true;
const preflight = process.env.P1_VISUAL_PREFLIGHT === "true";
const inspectOnly = process.env.P1_VISUAL_INSPECT === "true";
const outputDirectory = preflight
  ? path.join(root, "docs/testing/evidence/p1/visual/archive-diagnostic-headed-preflight")
  : path.join(root, "docs/testing/evidence/p1/visual");
const harnessUrl = `http://127.0.0.1:${port}/tests/harness/p1-visual.html`;
const fixtures = ["halo", "double-line", "color-bleed", "temporal-shimmer"];
const modes = ["anime-low", "anime-high", "safe-fallback"];
const selectedFixtures = process.env.P1_VISUAL_FIXTURE
  ? fixtures.filter((fixture) => fixture === process.env.P1_VISUAL_FIXTURE)
  : fixtures;
const selectedModes = process.env.P1_VISUAL_MODE
  ? modes.filter((mode) => mode === process.env.P1_VISUAL_MODE)
  : modes;

const server = await startServer(port);
let browser;
try {
  browser = await launchP1Browser({ chromeExecutable, headless });
  const gpuClient = await browser.newBrowserCDPSession();
  const gpuSystemInfo = summarizeGpuSystemInfo(await gpuClient.send("SystemInfo.getInfo"));
  assertHardwareGpu(gpuSystemInfo);
  const consoleErrors = [];
  const userAgents = new Set();
  const captures = [];
  const screenshots = new Map();
  for (const mode of selectedModes) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    try {
      await page.goto(harnessUrl, { waitUntil: "networkidle" });
      userAgents.add(await page.evaluate(() => navigator.userAgent));
      await page.waitForFunction(() => Boolean(window.__P1_VISUAL_RUN__), undefined, {
        timeout: 20_000,
      });
      await page.evaluate(() => window.__P1_VISUAL_READY__);
      for (const fixture of selectedFixtures) {
        const result = await page.evaluate(
          ({ mode: selectedMode, fixture: selectedFixture }) =>
            window.__P1_VISUAL_RUN__?.(selectedMode, selectedFixture),
          { mode, fixture },
        );
        if (!result) throw new Error(`${mode}/${fixture} capture sonucu yok`);
        // Headed Vulkan presentation is asynchronous; allow two compositor
        // frames and one short queue drain before the evidence-only readback.
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        await page.waitForTimeout(250);
        // Capture the headed compositor's actual WebGPU canvas surface. The
        // production frame path never performs this evidence-only screenshot.
        const screenshot = await page.screenshot({ fullPage: true });
        const outputBox = await page.locator("#output").boundingBox();
        const sourceBox = await page.locator("#source-display").boundingBox();
        const nonBlackPixelRatio = measureNonBlackPixels(screenshot, outputBox);
        const sourceNonBlackPixelRatio = measureNonBlackPixels(screenshot, sourceBox);
        if (nonBlackPixelRatio < 0.01 && !inspectOnly) {
          throw new Error(
            `Visual output siyah yakalandı (nonBlackPixelRatio=${nonBlackPixelRatio})`,
          );
        }
        if (sourceNonBlackPixelRatio < 0.01 && !inspectOnly) {
          throw new Error(
            `Original fixture siyah yakalandı (nonBlackPixelRatio=${sourceNonBlackPixelRatio})`,
          );
        }
        const outputEvidence = { nonBlackPixelRatio, sourceNonBlackPixelRatio };
        const screenshotFile = `${mode}-${fixture}.png`;
        screenshots.set(screenshotFile, screenshot);
        captures.push({
          ...result,
          // Preserve the raw per-capture timing used by the canonical manifest
          // gate; summaries alone are not sufficient for acceptance evidence.
          rawTimingSamples: [result.stats.cpuSubmitMs],
          screenshot: {
            file: screenshotFile,
            sha256: createHash("sha256").update(screenshot).digest("hex"),
            bytes: screenshot.byteLength,
            nonBlackPixelRatio: outputEvidence.nonBlackPixelRatio,
            sourceNonBlackPixelRatio: outputEvidence.sourceNonBlackPixelRatio,
          },
        });
      }
    } finally {
      const diagnostics = await page
        .evaluate(() => window.__P1_VISUAL_DIAGNOSTICS__)
        .catch(() => undefined);
      if (diagnostics && (diagnostics.uncapturedErrors.length > 0 || diagnostics.deviceLost)) {
        consoleErrors.push(`${mode} diagnostics: ${JSON.stringify(diagnostics)}`);
        process.stderr.write(`${mode} diagnostics: ${JSON.stringify(diagnostics)}\n`);
      }
      await page.evaluate(() => window.__P1_VISUAL_CLEANUP__?.()).catch(() => undefined);
      await page.close();
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    command: "node scripts/run-p1-visual-evidence.mjs",
    fixtureSeed: 0x51a7,
    frameIndex: 17,
    browser: "Chrome/Playwright visual harness",
    userAgents: [...userAgents],
    chromeExecutable,
    headless,
    requireHardware,
    hardwareStatus: gpuSystemInfo.hardwareStatus,
    gpuSystemInfo,
    objectiveChecks: {
      deterministicFixtureSeed: captures.every((capture) => capture.seed === 0x51a7),
      expectedModes: captures.length === modes.length * fixtures.length,
      playbackUnchanged: captures.every((capture) => capture.playbackUnchanged),
      directAnimePassMap: captures
        .filter((capture) => capture.mode !== "safe-fallback")
        .every((capture) => capture.stats.passCount === (capture.mode === "anime-high" ? 2 : 1)),
      safeFallbackPassMap: captures
        .filter((capture) => capture.mode === "safe-fallback")
        .every((capture) => capture.stats.passCount === 1),
      nonBlackOutput: captures.every(
        (capture) => (capture.screenshot.nonBlackPixelRatio ?? 0) >= 0.01,
      ),
      nonBlackSource: captures.every(
        (capture) => (capture.screenshot.sourceNonBlackPixelRatio ?? 0) >= 0.01,
      ),
      temporalPairChanges: captures
        .filter((capture) => capture.fixture === "temporal-shimmer")
        .every((capture) => capture.temporalPair?.first !== capture.temporalPair?.second),
    },
    captures,
    consoleErrors,
    humanReviewRequired: true,
  };
  if (!preflight) {
    assertCanonicalAcceptanceEvidence({
      headless,
      userAgents: [...userAgents],
      gpuEvidence: gpuSystemInfo,
      rawTimingSamples: captures.map((capture) => [capture.stats.cpuSubmitMs]),
      complete:
        captures.length === modes.length * fixtures.length &&
        consoleErrors.length === 0 &&
        Object.values(report.objectiveChecks).every(Boolean),
    });
  }
  await mkdir(outputDirectory, { recursive: true });
  for (const capture of captures) {
    await writeFile(
      path.join(outputDirectory, capture.screenshot.file),
      screenshots.get(capture.screenshot.file),
    );
  }
  await writeFile(
    path.join(outputDirectory, "visual-results.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

async function startServer(serverPort) {
  const { spawn } = await import("node:child_process");
  const server = spawn(
    process.execPath,
    [
      path.join(root, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      String(serverPort),
      "--strictPort",
    ],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
  );
  const waitUntil = Date.now() + 20_000;
  let serverLog = "";
  server.stdout.on("data", (chunk) => (serverLog += String(chunk)));
  server.stderr.on("data", (chunk) => (serverLog += String(chunk)));
  while (Date.now() < waitUntil) {
    try {
      const response = await fetch(harnessUrl);
      if (response.ok) return server;
    } catch {
      // The Vite process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  server.kill("SIGTERM");
  throw new Error(`Görsel harness sunucusu başlamadı: ${serverLog}`);
}

function measureNonBlackPixels(png, box) {
  if (!box) throw new Error("WebGPU output canvas bounding box missing");
  const crop = `${Math.max(1, Math.round(box.width))}x${Math.max(1, Math.round(box.height))}+${Math.max(0, Math.round(box.x))}+${Math.max(0, Math.round(box.y))}`;
  const output = execFileSync(
    "convert",
    [
      "png:-",
      "-crop",
      crop,
      "+repage",
      "-gravity",
      "center",
      "-crop",
      "80%x80%+0+0",
      "+repage",
      "-colorspace",
      "Gray",
      "-threshold",
      "4%",
      "-format",
      "%[fx:mean]",
      "info:-",
    ],
    { input: png, encoding: "utf8" },
  ).trim();
  const ratio = Number(output);
  if (!Number.isFinite(ratio)) throw new Error(`Visual output oranı okunamadı: ${output}`);
  return ratio;
}
