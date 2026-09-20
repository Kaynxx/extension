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
const port = Number(process.env.P2_P3_PORT ?? 4177);
const chromeExecutable = process.env.P1_CHROME_BIN ?? "chromium";
const frames = Number(process.env.P2_P3_FRAMES ?? 120);
if (process.env.P2_P3_HEADLESS === "true")
  throw new Error("P2/P3 canonical evidence headless yüzeyde üretilemez.");
if (![30, 60].includes(Number(process.env.P2_P3_FPS ?? 30)))
  throw new Error("FPS yalnız 30 veya 60 olabilir.");
const harnessUrl = `http://127.0.0.1:${port}/tests/harness/p2-p3.html`;
const outputDirectory = path.join(root, "docs/testing/evidence/p2-p3");
const server = await startServer(port);
let browser;
try {
  browser = await launchP1Browser({ chromeExecutable, headless: false });
  const gpuClient = await browser.newBrowserCDPSession();
  const gpuSystemInfo = summarizeGpuSystemInfo(await gpuClient.send("SystemInfo.getInfo"));
  assertHardwareGpu(gpuSystemInfo);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  const userAgents = [await page.evaluate(() => navigator.userAgent)];
  await page.waitForFunction(() => Boolean(window.__P2P3_RUN__), undefined, { timeout: 20_000 });
  const results = [];
  const screenshots = [];
  const requestedCase = process.env.P2_P3_CASE;
  for (const profile of ["live-action", "screen-3d"]) {
    for (const fps of [30, 60]) {
      for (const scale of [2, 3]) {
        if (requestedCase && requestedCase !== `${profile}/${fps}/${scale}`) continue;
        const result = await page.evaluate(
          ({ profile, fps, scale, frames }) => window.__P2P3_RUN__?.(profile, fps, scale, frames),
          { profile, fps, scale, frames },
        );
        if (!result || result.gpuErrors.length || result.failed)
          throw new Error(`P2/P3 koşusu başarısız: ${profile}/${fps}/${scale}`);
        results.push(result);
        screenshots.push({
          name: `${profile}-${fps}fps-${scale}x.png`,
          data: await page.screenshot({ fullPage: true }),
        });
      }
    }
  }
  const report = {
    generatedAt: new Date().toISOString(),
    command: "node scripts/run-p2-p3-evidence.mjs",
    headless: false,
    requireHardware: true,
    hardwareStatus: gpuSystemInfo.hardwareStatus,
    gpuSystemInfo,
    frames,
    candidates: [
      { id: "bundled-webgpu-baseline", backend: "WebGpuBackend", status: "measured" },
      { id: "websr-real-life", backend: "unported-candidate", status: "pending" },
      { id: "rt4ksr", backend: "unported-candidate", status: "pending" },
    ],
    results,
    realModelComparison: "pending-candidates-not-available",
    humanTextReview: "pending",
    screenshots: screenshots.map((s) => ({
      file: s.name,
      sha256: createHash("sha256").update(s.data).digest("hex"),
      bytes: s.data.byteLength,
    })),
  };
  assertCanonicalAcceptanceEvidence({
    headless: false,
    userAgents,
    gpuEvidence: gpuSystemInfo,
    rawTimingSamples: results.map((result) => result.processingSamplesMs),
    complete:
      results.length === 8 &&
      results.every((result) => result.failed === 0 && result.presented === result.frames),
  });
  await mkdir(outputDirectory, { recursive: true });
  for (const screenshot of screenshots)
    await writeFile(path.join(outputDirectory, screenshot.name), screenshot.data);
  await writeFile(
    path.join(outputDirectory, "p2-p3-results.json"),
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
  const deadline = Date.now() + 20_000;
  let log = "";
  server.stdout.on("data", (chunk) => (log += String(chunk)));
  server.stderr.on("data", (chunk) => (log += String(chunk)));
  while (Date.now() < deadline) {
    try {
      if ((await fetch(harnessUrl)).ok) return server;
    } catch {
      // Vite may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  server.kill("SIGTERM");
  throw new Error(`P2/P3 harness sunucusu başlamadı: ${log}`);
}
