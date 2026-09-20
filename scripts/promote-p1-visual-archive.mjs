import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { assertHardwareGpu, summarizeGpuSystemInfo } from "./gpu-evidence.mjs";
import { launchP1Browser } from "./p1-browser.mjs";

/**
 * Promote an already captured, headed visual archive to the canonical path.
 *
 * This is deliberately not a visual rerun: it verifies every archived PNG and
 * obtains fresh headed user-agent/GPU provenance. Headless archives remain
 * mechanical-only and still requires native/human review.
 */
const root = process.cwd();
const archiveDirectory = path.join(
  root,
  "docs/testing/evidence/p1/visual/archive-diagnostic-headless-2026-09-15",
);
const archiveManifestPath = path.join(archiveDirectory, "visual-results.json");
const outputDirectory = path.join(root, "docs/testing/evidence/p1/visual");
const outputManifestPath = path.join(outputDirectory, "visual-results.json");
const chromeExecutable = process.env.P1_CHROME_BIN ?? "chromium";

if (process.env.P1_VISUAL_HEADLESS === "true") {
  throw new Error("Canonical P1 evidence cannot be produced from a headless surface.");
}

const archive = JSON.parse(await readFile(archiveManifestPath, "utf8"));
if (archive.headless !== false || archive.requireHardware !== true) {
  throw new Error("Görsel arşiv headed + requireHardware kanıtını taşımıyor.");
}
if (archive.hardwareStatus !== "hardware") {
  throw new Error("Görsel arşiv fiziksel GPU durumunu doğrulamıyor.");
}
if (!Array.isArray(archive.captures) || archive.captures.length !== 12) {
  throw new Error("Görsel arşivde beklenen 12 capture bulunamadı.");
}
if (
  !archive.objectiveChecks ||
  Object.values(archive.objectiveChecks).some((value) => value !== true)
) {
  throw new Error("Görsel arşivin objectiveChecks alanı tamamı true değil.");
}

for (const capture of archive.captures) {
  const screenshotPath = path.join(archiveDirectory, capture.screenshot?.file ?? "");
  const screenshot = await readFile(screenshotPath);
  const hash = createHash("sha256").update(screenshot).digest("hex");
  if (hash !== capture.screenshot?.sha256) {
    throw new Error(`PNG hash doğrulaması başarısız: ${capture.screenshot?.file}`);
  }
  if (screenshot.byteLength !== capture.screenshot?.bytes) {
    throw new Error(`PNG byte doğrulaması başarısız: ${capture.screenshot?.file}`);
  }
}

const browser = await launchP1Browser({ chromeExecutable, headless: false });
try {
  const gpuClient = await browser.newBrowserCDPSession();
  const gpuSystemInfo = summarizeGpuSystemInfo(await gpuClient.send("SystemInfo.getInfo"));
  assertHardwareGpu(gpuSystemInfo);
  const page = await browser.newPage();
  const userAgent = await page.evaluate(() => navigator.userAgent);
  await page.close();
  if (/HeadlessChrome/i.test(userAgent)) {
    throw new Error("Açılan doğrulama yüzeyi HeadlessChrome user-agent taşıyor.");
  }

  const report = {
    ...archive,
    generatedAt: new Date().toISOString(),
    command: "node scripts/promote-p1-visual-archive.mjs",
    manifestKind: "headed-mechanical-archive",
    sourceArchive: path.relative(root, archiveManifestPath),
    sourceArchiveGeneratedAt: archive.generatedAt,
    sourceArchiveConsoleErrors: archive.consoleErrors ?? [],
    userAgents: [userAgent],
    chromeExecutable,
    headless: false,
    requireHardware: true,
    hardwareStatus: gpuSystemInfo.hardwareStatus,
    gpuSystemInfo,
    humanReviewRequired: true,
    nativeYouTubeReviewRequired: true,
    acceptanceStatus: "mechanical-only; human/native review pending",
    promotionChecks: {
      archiveCaptureCount: archive.captures.length === 12,
      archivedPngHashes: true,
      headedUserAgent: true,
      physicalGpuProbe: true,
    },
  };

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputManifestPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await browser.close();
}
