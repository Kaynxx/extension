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
const sweep = [
  [0.12, 0.045],
  [0.12, 0.08],
  [0.12, 0.12],
  [0.12, 0.18],
  [0.15, 0.045],
  [0.15, 0.08],
  [0.15, 0.12],
  [0.15, 0.18],
  [0.18, 0.045],
  [0.18, 0.08],
  [0.18, 0.12],
  [0.18, 0.18],
];
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
  for (const [blend, gate] of sweep)
    for (const fps of [30, 60])
      for (const scenario of scenarios)
        for (const temporal of [false, true]) {
          const result = await page.evaluate((run) => window.__P4_RUN__?.(run), {
            fps,
            scenario,
            temporal,
            blend,
            gate,
          });
          if (!result) throw new Error("P4 sonucu yok");
          const shot = await page.screenshot();
          const file = `b${blend}-g${gate}-${temporal ? "on" : "off"}-${fps}-${scenario}.png`;
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
    sweep: sweep.map(([blend, gate]) => ({ blend, gate })),
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
  const parameterGroups = new Map();
  for (const metric of report.pairedMetrics) {
    const key = `${metric.blend}-${metric.gate}`;
    const group = parameterGroups.get(key) ?? {
      blend: metric.blend,
      gate: metric.gate,
      metrics: [],
    };
    group.metrics.push(metric);
    parameterGroups.set(key, group);
  }
  report.passingParameters = [...parameterGroups.values()]
    .filter((group) => group.metrics.length === 6 && group.metrics.every((metric) => metric.pass))
    .sort((left, right) => left.blend - right.blend || left.gate - right.gate)
    .map(({ blend, gate }) => ({ blend, gate }));
  report.selectedParameters = report.passingParameters[0] ?? null;
  report.canonical = colorValid && report.selectedParameters !== null;
  if (!report.canonical) {
    report.failure = colorValid
      ? "Canonical promotion pending: no parameter pair passed every OFF/ON temporal threshold."
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
  for (const [blend, gate] of sweep) {
    for (const fps of [30, 60]) {
      for (const scenario of scenarios) {
        const off = rows.find(
          (row) =>
            row.fps === fps &&
            row.scenario === scenario &&
            row.temporal === false &&
            row.blend === blend &&
            row.gate === gate,
        );
        const on = rows.find(
          (row) =>
            row.fps === fps &&
            row.scenario === scenario &&
            row.temporal === true &&
            row.blend === blend &&
            row.gate === gate,
        );
        if (!off || !on) continue;
        const offShimmer = Number(off.metrics?.shimmerDeltaMean ?? 0);
        const onShimmer = Number(on.metrics?.shimmerDeltaMean ?? 0);
        const shimmerImprovement = offShimmer > 1e-9 ? (offShimmer - onShimmer) / offShimmer : 0;
        const budget = fps === 30 ? thresholds.p95Ms30 : thresholds.p95Ms60;
        const metric = {
          fps,
          scenario,
          blend: Number(on.blend ?? 0.12),
          gate: Number(on.gate ?? 0.045),
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
  }
  return paired;
}
