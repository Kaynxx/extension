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
const port = Number(process.env.P1_ADAPTIVE_PORT ?? 4176);
const chromeExecutable = process.env.P1_CHROME_BIN ?? "chromium";
if (process.env.P1_ADAPTIVE_HEADLESS === "true") {
  throw new Error("Canonical P1 evidence cannot be produced from a headless surface.");
}
const headless = false;
const harnessUrl = `http://127.0.0.1:${port}/tests/harness/p1-adaptive.html`;
const outputDirectory = path.join(root, "docs/testing/evidence/p1");

const server = await startServer(port);
let browser;
try {
  browser = await launchP1Browser({ chromeExecutable, headless });
  const gpuClient = await browser.newBrowserCDPSession();
  const gpuSystemInfo = summarizeGpuSystemInfo(await gpuClient.send("SystemInfo.getInfo"));
  assertHardwareGpu(gpuSystemInfo);

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__P1_ADAPTIVE_RUN__), undefined, {
    timeout: 20_000,
  });
  const result = await page.evaluate(() => window.__P1_ADAPTIVE_RUN__?.());
  if (!result) throw new Error("Adaptive benchmark sonucu yok.");
  if (result.adapter.isFallbackAdapter === true) {
    throw new Error("Adaptive benchmark hardware gate: WebGPU fallback adapter.");
  }
  if (result.gpuErrors.length > 0) {
    throw new Error(`Adaptive benchmark GPU validation error: ${result.gpuErrors[0]}`);
  }
  const transitions = result.transitions;
  const downgrade = transitions.find(
    (transition) => transition.from === "high" && transition.to === "low",
  );
  const recovery = transitions.find(
    (transition) => transition.from === "low" && transition.to === "high",
  );
  const checks = {
    headed: headless === false,
    hardware: gpuSystemInfo.hardwareStatus === "hardware",
    highToLow: Boolean(downgrade),
    overloadExceededBudget: result.overloadPhase.p95Ms > result.frameBudgetMs,
    settledLowWithinBudget: result.settledLowPhase.p95Ms <= result.frameBudgetMs,
    recoveryAfterFiveSeconds:
      Boolean(recovery) &&
      recovery.timestampMs - (downgrade?.timestampMs ?? recovery.timestampMs) >= 5_000,
    lowToHigh: Boolean(recovery),
    latestFrameSingleFlight: result.counters.maxConcurrentPrepares <= 1,
    noGpuErrors: result.gpuErrors.length === 0,
    noFailedFrames: result.counters.failedFrames === 0,
    complete: result.finalQuality === "high" && result.controller.bypassRequested === false,
    noConsoleErrors: consoleErrors.length === 0,
  };
  if (!Object.values(checks).every(Boolean)) {
    throw new Error(`Adaptive acceptance checks failed: ${JSON.stringify(checks)}`);
  }
  assertCanonicalAcceptanceEvidence({
    headless,
    userAgents: [result.browser],
    gpuEvidence: gpuSystemInfo,
    rawTimingSamples: [result.rawSamplesMs],
    complete: checks.complete && checks.noConsoleErrors,
  });
  const report = {
    generatedAt: new Date().toISOString(),
    command: "node scripts/run-p1-adaptive-evidence.mjs",
    chromeExecutable,
    headless,
    requireHardware: true,
    gpuSystemInfo,
    checks,
    result,
    consoleErrors,
  };
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, "adaptive-results.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  await page.close();
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
  let serverLog = "";
  server.stdout.on("data", (chunk) => (serverLog += String(chunk)));
  server.stderr.on("data", (chunk) => (serverLog += String(chunk)));
  while (Date.now() < deadline) {
    try {
      const response = await fetch(harnessUrl);
      if (response.ok) return server;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  server.kill("SIGTERM");
  throw new Error(`Adaptive harness sunucusu başlamadı: ${serverLog}`);
}
