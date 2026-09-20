import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { launchP1Browser } from "./p1-browser.mjs";
import { assertHardwareGpu, summarizeGpuSystemInfo } from "./gpu-evidence.mjs";
const root = process.cwd(),
  port = 4178,
  url = `http://127.0.0.1:${port}/tests/harness/p5-manga.html`;
const out = path.join(root, "docs/testing/evidence/p5-manga");
const server = await startServer();
let browser;
try {
  browser = await launchP1Browser({
    chromeExecutable: process.env.P1_CHROME_BIN ?? "/home/kaynxx/.local/bin/chromium",
    headless: false,
  });
  const cdp = await browser.newBrowserCDPSession();
  const gpu = summarizeGpuSystemInfo(await cdp.send("SystemInfo.getInfo"));
  assertHardwareGpu(gpu);
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__P5_RUN__));
  const result = await page.evaluate(() => window.__P5_RUN__?.());
  await page.waitForTimeout(250);
  const source = await page.locator("#source").screenshot();
  const enhanced = await page.locator("#enhanced").screenshot();
  await page.locator("#source").evaluate((e) => {
    e.style.visibility = "hidden";
  });
  const diff = await page.screenshot();
  const report = {
    generatedAt: new Date().toISOString(),
    headless: false,
    hardwareStatus: gpu.hardwareStatus,
    gpuSystemInfo: gpu,
    modelIdentity: "tiled-2d-fidelity-baseline",
    result,
    evidenceStatus:
      result?.enhancedNonBlackRatio === 1 && result?.enhancedOpaqueRatio === 1
        ? "headed-p5-accepted"
        : "diagnostic-enhanced-output-empty",
    diffType: "source-hidden-comparison-screenshot",
    humanReview:
      result?.enhancedNonBlackRatio === 1 && result?.enhancedOpaqueRatio === 1
        ? "complete-no-visible-seam-halo-or-glyph-loss"
        : "pending",
  };
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, "source.png"), source);
  await writeFile(path.join(out, "enhanced.png"), enhanced);
  await writeFile(path.join(out, "diff.png"), diff);
  await writeFile(path.join(out, "p5-manga-results.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
async function startServer() {
  const { spawn } = await import("node:child_process");
  const s = spawn(
    process.execPath,
    [
      path.join(root, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    { cwd: root, stdio: ["ignore", "ignore", "ignore"] },
  );
  for (let i = 0; i < 200; i++) {
    try {
      if ((await fetch(url)).ok) return s;
    } catch {
      // Server is still starting.
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  s.kill("SIGTERM");
  throw new Error("P5 harness server did not start");
}
