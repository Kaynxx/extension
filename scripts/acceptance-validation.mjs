import { readFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const P1_VISUAL_MODES = ["anime-low", "anime-high", "safe-fallback"];
export const P1_VISUAL_FIXTURES = ["halo", "double-line", "color-bleed", "temporal-shimmer"];
export const P2_P3_FPS = [30, 60];
export const P2_P3_SCALES = [2, 3];

const SHA256 = /^[a-f0-9]{64}$/i;

export function assertHeadedValidationSurface({ headless, userAgents, hardwareStatus }) {
  if (headless !== false) {
    throw new Error("Kabul yüzeyi headed Chromium olmalıdır; headless koşu geçersizdir.");
  }
  if (
    !Array.isArray(userAgents) ||
    userAgents.length === 0 ||
    userAgents.some((agent) => /HeadlessChrome/i.test(String(agent)))
  ) {
    throw new Error("Kabul yüzeyi HeadlessChrome user-agent kabul etmez.");
  }
  if (hardwareStatus !== "hardware") {
    throw new Error("Kabul yüzeyi fiziksel GPU/WebGPU kanıtı ister.");
  }
}

export function validateCanonicalVisualManifest(manifest) {
  const errors = [];
  try {
    assertHeadedValidationSurface(manifest ?? {});
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (manifest?.requireHardware !== true) errors.push("requireHardware=true olmalıdır.");
  if (manifest?.humanReviewRequired !== true) errors.push("humanReviewRequired=true olmalıdır.");
  if (manifest?.objectiveChecks?.expectedModes !== true)
    errors.push("12 görsel koşul tamamlanmamış.");
  if (
    manifest?.objectiveChecks &&
    Object.values(manifest.objectiveChecks).some((value) => value !== true)
  ) {
    errors.push("Görsel objectiveChecks tamamı true olmalıdır.");
  }
  const expected = new Set(
    P1_VISUAL_MODES.flatMap((mode) => P1_VISUAL_FIXTURES.map((fixture) => `${mode}/${fixture}`)),
  );
  const captures = Array.isArray(manifest?.captures) ? manifest.captures : [];
  const actual = new Set(captures.map((capture) => `${capture?.mode}/${capture?.fixture}`));
  if (captures.length !== expected.size || [...expected].some((key) => !actual.has(key))) {
    errors.push("Her mod/fixture için tam görsel capture manifestte bulunmalıdır.");
  }
  for (const capture of captures) {
    if (!capture?.sourceHash || !/^[a-f0-9]{8,64}$/i.test(capture.sourceHash)) {
      errors.push("Her capture sourceHash içermelidir.");
    }
    const hash = capture?.screenshot?.sha256;
    if (!SHA256.test(String(hash ?? ""))) errors.push("Her screenshot tam SHA-256 içermelidir.");
    if (!Number.isInteger(capture?.screenshot?.bytes) || capture.screenshot.bytes <= 0) {
      errors.push("Her screenshot bytes bilgisi içermelidir.");
    }
    if (
      (!Array.isArray(capture?.rawTimingSamples) || capture.rawTimingSamples.length === 0) &&
      !Number.isFinite(capture?.stats?.cpuSubmitMs)
    ) {
      errors.push("Her capture ham zaman örnekleri içermelidir.");
    }
  }
  return { valid: errors.length === 0, errors };
}

export function buildAcceptancePlan() {
  return {
    policy: "headed-only; headless evidence is invalid",
    browserRunsStarted: false,
    nativeYouTube: {
      status: "pending-non-desktop-human-review",
      source: "native YouTube HTMLVideoElement",
      checks: [
        "external-video frame path and overlay alignment",
        "CORS/origin-clean failure safely restores original video",
        "DRM/protected media is detected and bypassed; protection is never bypassed",
        "pause/seek/rate/quality/fullscreen/captions/controls remain unchanged",
        "human A/B visual review records halo, double-line, color bleed and temporal shimmer",
      ],
    },
    p1Visual: {
      status: "pending-headed-physical-gpu-run",
      modes: P1_VISUAL_MODES,
      fixtures: P1_VISUAL_FIXTURES,
      canonicalPath: "docs/testing/evidence/p1/visual/visual-results.json",
      writeRule: "write only after all 12 headed physical-GPU captures and raw hashes pass",
    },
    p2P3: {
      status: "pending-real-model-comparison",
      candidateIdentityRequired: true,
      resultsMustNotBeInvented: true,
      candidates: [
        { id: "bundled-webgpu-baseline", backend: "WebGpuBackend", status: "implemented-baseline" },
        { id: "websr-real-life", backend: "unported-candidate", status: "pending" },
        { id: "rt4ksr", backend: "unported-candidate", status: "pending" },
      ],
      matrix: P2_P3_FPS.flatMap((fps) =>
        P2_P3_SCALES.map((scale) => ({ fps, scale, status: "pending" })),
      ),
      metrics: [
        "p50/p95/p99 processing time and dropped frames",
        "deterministic edge/halo proxy metrics",
        "deterministic text/OCR-proxy character-integrity metrics",
        "human text-integrity checklist for screen/3D content",
      ],
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = new Set(process.argv.slice(2));
  if (args.has("--plan")) {
    process.stdout.write(`${JSON.stringify(buildAcceptancePlan(), null, 2)}\n`);
  } else if (args.has("--validate-manifest")) {
    const index = process.argv.indexOf("--validate-manifest");
    const file = process.argv[index + 1];
    if (!file) throw new Error("--validate-manifest bir JSON yolu ister.");
    const result = validateCanonicalVisualManifest(JSON.parse(await readFile(file, "utf8")));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.valid) process.exitCode = 1;
  } else {
    process.stderr.write(
      "Kullanım: node scripts/acceptance-validation.mjs --plan | --validate-manifest <json>\n",
    );
    process.exitCode = 2;
  }
}
