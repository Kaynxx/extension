import { createHash } from "node:crypto";
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
const outputDirectory = path.join(root, "docs/testing/evidence/p1/visual");
const harnessUrl = `http://127.0.0.1:${port}/tests/harness/p1-visual.html`;
const fixtures = ["halo", "double-line", "color-bleed", "temporal-shimmer"];
const modes = ["anime-low", "anime-high", "safe-fallback"];

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
  for (const mode of modes) {
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
      for (const fixture of fixtures) {
        const result = await page.evaluate(
          ({ mode: selectedMode, fixture: selectedFixture }) =>
            window.__P1_VISUAL_RUN__?.(selectedMode, selectedFixture),
          { mode, fixture },
        );
        if (!result) throw new Error(`${mode}/${fixture} capture sonucu yok`);
        // Some Chromium compositors capture a WebGPU swapchain as a transparent
        // surface. Composite the already-rendered canvas into a temporary
        // image only for this evidence screenshot; the production frame path
        // never performs a CPU readback.
        const outputEvidence = await page.evaluate(async () => {
          const canvas = document.querySelector("#output");
          if (!(canvas instanceof HTMLCanvasElement) || !canvas.parentElement) {
            throw new Error("Visual output canvas bulunamadı");
          }
          const image = new Image();
          image.id = "p1-visual-evidence-output";
          image.src = canvas.toDataURL();
          await image.decode();
          const sample = document.createElement("canvas");
          sample.width = 64;
          sample.height = 36;
          const sampleContext = sample.getContext("2d", { willReadFrequently: true });
          if (!sampleContext) throw new Error("Visual output örnek context oluşturulamadı");
          sampleContext.drawImage(image, 0, 0, sample.width, sample.height);
          const pixels = sampleContext.getImageData(0, 0, sample.width, sample.height).data;
          let nonBlackPixels = 0;
          for (let index = 0; index < pixels.length; index += 4) {
            if ((pixels[index] ?? 0) + (pixels[index + 1] ?? 0) + (pixels[index + 2] ?? 0) > 12)
              nonBlackPixels += 1;
          }
          const nonBlackPixelRatio = nonBlackPixels / (sample.width * sample.height);
          if (nonBlackPixelRatio < 0.01) {
            throw new Error(
              `Visual output siyah yakalandı (nonBlackPixelRatio=${nonBlackPixelRatio})`,
            );
          }
          Object.assign(image.style, {
            position: "absolute",
            inset: "0",
            width: "100%",
            height: "100%",
            objectFit: "contain",
            zIndex: "1",
            pointerEvents: "none",
          });
          if (nonBlackPixelRatio >= 0.01) {
            canvas.style.display = "none";
            canvas.parentElement.append(image);
          }
          return { nonBlackPixelRatio };
        });
        const screenshot = await page.screenshot({ fullPage: true });
        await page.evaluate(() => {
          document.querySelector("#p1-visual-evidence-output")?.remove();
          const canvas = document.querySelector("#output");
          if (canvas instanceof HTMLCanvasElement) canvas.style.display = "";
        });
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
          },
        });
      }
    } finally {
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
      temporalPairChanges: captures
        .filter((capture) => capture.fixture === "temporal-shimmer")
        .every((capture) => capture.temporalPair?.first !== capture.temporalPair?.second),
    },
    captures,
    consoleErrors,
    humanReviewRequired: true,
  };
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
