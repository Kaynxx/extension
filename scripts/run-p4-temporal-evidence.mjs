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
    canonical: false,
    captureStatus: "headed-final-texture-readback",
    failure:
      colorCheck?.changed === false
        ? "Diagnostic failure: known changing-color readback produced identical hashes; temporal output texture is black/unchanged."
        : "Canonical promotion remains pending until OFF/ON metrics and human review pass.",
  };
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
