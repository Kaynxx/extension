import { spawn } from "node:child_process";
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
const port = Number(process.env.P1_BENCHMARK_PORT ?? 4173);
const frames = Number(process.env.P1_BENCHMARK_FRAMES ?? 120);
const chromeExecutable = process.env.P1_CHROME_BIN ?? "chromium";
if (process.env.P1_HEADLESS === "false") {
  throw new Error(
    "Bu çalışma alanında kullanıcı talimatı gereği headed/desktop testleri kapalıdır.",
  );
}
const headless = true;
const requireHardware = true;
const writeEvidence = process.env.P1_WRITE_EVIDENCE !== "false";
const evidenceDirectory = path.join(root, "docs/testing/evidence/p1");
const harnessUrl = `http://127.0.0.1:${port}/tests/harness/p1-anime.html`;

if (![12, 120, 300].includes(frames)) {
  throw new Error("P1_BENCHMARK_FRAMES 12, 120 veya 300 olmalıdır.");
}

const server = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
);

let serverLog = "";
server.stdout.on("data", (chunk) => (serverLog += String(chunk)));
server.stderr.on("data", (chunk) => (serverLog += String(chunk)));

let browser;
try {
  await waitForServer(harnessUrl, 20_000);
  browser = await launchP1Browser({ chromeExecutable, headless });
  const gpuSystemInfo = await readGpuSystemInfo(browser);
  assertHardwareGpu(gpuSystemInfo);
  const saveEvidence =
    writeEvidence && requireHardware && gpuSystemInfo.hardwareStatus === "hardware";
  const consoleErrors = [];
  const userAgents = new Set();
  const screenshots = [];

  const results = [];
  for (const fps of [24, 30]) {
    for (const quality of ["low", "high"]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(`${fps}/${quality}: ${message.text()}`);
      });
      page.on("pageerror", (error) => consoleErrors.push(`${fps}/${quality}: ${error.message}`));
      try {
        await page.goto(harnessUrl, { waitUntil: "networkidle" });
        userAgents.add(await page.evaluate(() => navigator.userAgent));
        await page.selectOption("#fps", String(fps));
        await page.selectOption("#quality", quality);
        await page.selectOption("#frames", String(frames));
        await page.click("#run");
        await page.waitForFunction(
          () => ["complete", "error"].includes(document.documentElement.dataset.benchmark ?? ""),
          undefined,
          { timeout: 240_000 },
        );
        const state = await page.evaluate(() => ({
          result: window.__P1_BENCHMARK__,
          error: window.__P1_BENCHMARK_ERROR__,
        }));
        if (!state.result) {
          throw new Error(
            `${fps} FPS ${quality} benchmark başarısız: ${state.error ?? "bilinmeyen hata"}`,
          );
        }
        if (state.result.adapter.isFallbackAdapter === true) {
          throw new Error(
            `${fps} FPS ${quality} benchmark hardware gate: WebGPU fallback adapter.`,
          );
        }
        if (state.result.gpuErrors.length > 0) {
          throw new Error(
            `${fps} FPS ${quality} benchmark GPU validation error: ${state.result.gpuErrors[0]}`,
          );
        }
        if (
          state.result.sourceMode !== "synthetic-canvas-imagebitmap" ||
          !Array.isArray(state.result.processingSamplesMs) ||
          state.result.processingSamplesMs.length < frames
        ) {
          throw new Error(`${fps} FPS ${quality} benchmark raw zaman örnekleri eksik.`);
        }
        const recomputed = summarizeRawTiming(state.result.processingSamplesMs);
        for (const key of ["p50Ms", "p95Ms", "p99Ms"]) {
          if (Math.abs(recomputed[key] - state.result[key]) > 0.000001) {
            throw new Error(
              `${fps} FPS ${quality} benchmark ${key} raw örneklerden yeniden üretilemedi.`,
            );
          }
        }
        results.push(state.result);
        if (saveEvidence) {
          // `PreparedFrame.present()` submits the swapchain command without
          // blocking the main thread. Give the compositor two frames to consume
          // that submission before capturing the A/B artifact.
          await page.evaluate(
            () =>
              new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
          );
          await page.waitForTimeout(250);
          await page.evaluate(async () => {
            const canvas = document.querySelector("#output");
            if (!(canvas instanceof HTMLCanvasElement) || !canvas.parentElement) return;
            const image = new Image();
            image.id = "p1-evidence-output";
            image.src = canvas.toDataURL();
            await image.decode();
            const style = getComputedStyle(canvas);
            Object.assign(image.style, {
              position: "absolute",
              inset: "0",
              width: style.width,
              height: style.height,
              objectFit: "contain",
              zIndex: "2",
              pointerEvents: "none",
              clipPath: style.clipPath,
            });
            canvas.style.visibility = "hidden";
            canvas.parentElement.append(image);
          });
          screenshots.push({
            name: `anime-ab-${fps}fps-${quality}.png`,
            data: await page.screenshot({ fullPage: true }),
          });
          await page.evaluate(() => {
            document.querySelector("#p1-evidence-output")?.remove();
            const canvas = document.querySelector("#output");
            if (canvas instanceof HTMLCanvasElement) canvas.style.visibility = "";
          });
        }
        await page.evaluate(() => window.__P1_CLEANUP__?.());
      } finally {
        await page.close();
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    command: "node scripts/run-p1-benchmark.mjs",
    chromeExecutable,
    headless,
    requireHardware,
    writeEvidence,
    evidenceWritten: saveEvidence,
    visualEvidenceWritten: screenshots.length > 0,
    gpuSystemInfo,
    framesPerRun: frames,
    results,
    consoleErrors,
  };
  assertCanonicalAcceptanceEvidence({
    headless,
    userAgents: [...userAgents],
    gpuEvidence: gpuSystemInfo,
    rawTimingSamples: results.map((result) => result.processingSamplesMs),
    complete: results.length === 4 && consoleErrors.length === 0,
  });
  if (saveEvidence) {
    await mkdir(evidenceDirectory, { recursive: true });
    for (const screenshot of screenshots) {
      await writeFile(path.join(evidenceDirectory, screenshot.name), screenshot.data);
    }
    const reportPath = path.join(evidenceDirectory, "benchmark-results.json");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  if (serverLog) process.stderr.write(`\nVite output:\n${serverLog}\n`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

async function readGpuSystemInfo(browser) {
  const client = await browser.newBrowserCDPSession();
  return summarizeGpuSystemInfo(await client.send("SystemInfo.getInfo"));
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Vite benchmark yüzeyi başlamadı: ${String(lastError)}`);
}

function summarizeRawTiming(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const nearestRank = (percentile) =>
    sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)] ?? 0;
  return {
    p50Ms: nearestRank(0.5),
    p95Ms: nearestRank(0.95),
    p99Ms: nearestRank(0.99),
  };
}
