import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { launchP1Browser } from "./p1-browser.mjs";
import { assertHardwareGpu, summarizeGpuSystemInfo } from "./gpu-evidence.mjs";
const root = process.cwd();
const port = 4176;
const out = path.join(root, "docs/testing/evidence/p4/temporal");
const server = (await import("node:child_process")).spawn(
  process.execPath,
  [
    path.join(root, "node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  { cwd: root, stdio: "ignore" },
);
let browser;
const scenarios = ["shimmer", "fast-pan", "scene-cut"];
const rows = [];
const screenshots = [];
try {
  browser = await launchP1Browser({
    chromeExecutable: process.env.P1_CHROME_BIN ?? "chromium",
    headless: false,
  });
  const client = await browser.newBrowserCDPSession();
  const gpu = summarizeGpuSystemInfo(await client.send("SystemInfo.getInfo"));
  assertHardwareGpu(gpu);
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  await page.goto(`http://127.0.0.1:${port}/tests/harness/p4-temporal.html`, {
    waitUntil: "networkidle",
  });
  const userAgent = await page.evaluate(() => navigator.userAgent);
  if (userAgent.includes("HeadlessChrome")) {
    throw new Error(`Headless UA rejected: ${userAgent}`);
  }
  await page.waitForFunction(() => Boolean(window.__P4_RUN__), undefined, { timeout: 20000 });
  const colorCheck = await page.evaluate(() => window.__P4_COLOR_CHECK__?.());
  for (const fps of [30, 60])
    for (const scenario of scenarios)
      for (const temporal of [false, true]) {
        const result = await page.evaluate((run) => window.__P4_RUN__?.(run), {
          fps,
          scenario,
          temporal,
        });
        if (!result) throw new Error("P4 sonucu yok");
        const shot = await page.screenshot();
        const file = `${temporal ? "on" : "off"}-${fps}-${scenario}.png`;
        screenshots.push({ file, shot });
        rows.push({ ...result, screenshot: { file, bytes: shot.byteLength } });
      }
  const report = {
    generatedAt: new Date().toISOString(),
    headless: false,
    userAgent,
    gpu,
    thresholds: {
      shimmerImprovementMin: 0.1,
      maxSceneCutLeakage: 0.08,
      maxGhostError: 0.12,
      p95Ms30: 24,
      p95Ms60: 16.7,
    },
    colorCheck,
    rows,
    pairedMetrics: compareTemporalRows(rows),
    canonical: false,
    captureStatus: "headed-final-texture-readback",
    failure:
      "Canonical promotion remains pending until all color, OFF/ON metric, GPU-error, and human-review gates pass.",
  };
  const colorStages = Array.isArray(colorCheck?.stages) ? colorCheck.stages : [];
  const colorValid =
    colorCheck?.changed === true &&
    colorCheck?.cpuDistinct === true &&
    colorCheck?.bitmapDistinct === true &&
    colorStages.length === 2 &&
    colorStages.every(
      (stage) =>
        stage.cpuLuma > 1 &&
        stage.bitmapLuma > 1 &&
        stage.sourceLuma > 1 &&
        stage.finalLuma > 1 &&
        stage.temporalLuma > 1,
    );
  report.colorValid = colorValid;
  report.canonical =
    colorValid &&
    report.pairedMetrics.length === 6 &&
    report.pairedMetrics.every((metric) => metric.pass);
  if (!report.canonical) {
    report.failure = colorValid
      ? "Canonical promotion pending: one or more paired OFF/ON temporal thresholds did not pass."
      : "Diagnostic only: CPU/bitmap/GPU color preflight did not pass all nonblack/distinct stages.";
  }
  await mkdir(out, { recursive: true });
  for (const s of screenshots) await writeFile(path.join(out, s.file), s.shot);
  await writeFile(path.join(out, "temporal-results.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

function compareTemporalRows(rows) {
  const thresholds = {
    shimmerImprovementMin: 0.1,
    maxSceneCutLeakage: 0.08,
    maxGhostError: 0.12,
    p95Ms30: 24,
    p95Ms60: 16.7,
  };
  const paired = [];
  for (const fps of [30, 60]) {
    for (const scenario of scenarios) {
      const off = rows.find(
        (row) => row.fps === fps && row.scenario === scenario && row.temporal === false,
      );
      const on = rows.find(
        (row) => row.fps === fps && row.scenario === scenario && row.temporal === true,
      );
      if (!off || !on) continue;
      const offShimmer = Number(off.metrics?.shimmerDeltaMean ?? 0);
      const onShimmer = Number(on.metrics?.shimmerDeltaMean ?? 0);
      const shimmerImprovement = offShimmer > 1e-9 ? (offShimmer - onShimmer) / offShimmer : 0;
      const budget = fps === 30 ? thresholds.p95Ms30 : thresholds.p95Ms60;
      const metric = {
        fps,
        scenario,
        offShimmer,
        onShimmer,
        shimmerImprovement,
        ghostError: Number(on.metrics?.ghostErrorMax ?? Infinity),
        sceneCutLeakage: Number(on.metrics?.sceneCutLeakageMax ?? Infinity),
        cpuSubmitP95: Number(on.metrics?.cpuSubmitP95 ?? Infinity),
        queueP95: Number(on.metrics?.queueP95 ?? Infinity),
      };
      metric.pass =
        metric.shimmerImprovement >= thresholds.shimmerImprovementMin &&
        metric.ghostError <= thresholds.maxGhostError &&
        metric.sceneCutLeakage <= thresholds.maxSceneCutLeakage &&
        metric.cpuSubmitP95 <= budget &&
        metric.queueP95 <= budget &&
        (off.gpuErrors?.length ?? 0) === 0 &&
        (on.gpuErrors?.length ?? 0) === 0;
      paired.push(metric);
    }
  }
  return paired;
}
