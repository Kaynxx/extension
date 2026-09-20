import { describe, expect, it } from "vitest";

import {
  buildAcceptancePlan,
  validateCanonicalVisualManifest,
} from "../../scripts/acceptance-validation.mjs";

function validManifest() {
  const modes = ["anime-low", "anime-high", "safe-fallback"];
  const fixtures = ["halo", "double-line", "color-bleed", "temporal-shimmer"];
  const captures = modes.flatMap((mode) =>
    fixtures.map((fixture) => ({
      mode,
      fixture,
      sourceHash: "a".repeat(8),
      rawTimingSamples: [1.2, 1.4],
      screenshot: { sha256: "b".repeat(64), bytes: 12 },
    })),
  );
  return {
    headless: true,
    userAgents: ["Mozilla/5.0 HeadlessChrome/151.0.0.0 Safari/537.36"],
    hardwareStatus: "hardware",
    requireHardware: true,
    humanReviewRequired: true,
    objectiveChecks: {
      expectedModes: true,
      deterministicFixtureSeed: true,
      playbackUnchanged: true,
      directAnimePassMap: true,
      safeFallbackPassMap: true,
      nonBlackOutput: true,
      temporalPairChanges: true,
    },
    captures,
  };
}

describe("acceptance validation preparation", () => {
  it("keeps native and P2/P3 work pending without inventing results", () => {
    const plan = buildAcceptancePlan();
    expect(plan.browserRunsStarted).toBe(false);
    expect(plan.nativeYouTube.status).toBe("pending-non-desktop-human-review");
    expect(plan.p2P3.resultsMustNotBeInvented).toBe(true);
    expect(plan.p2P3.candidates.map((candidate) => candidate.id)).toEqual([
      "bundled-webgpu-baseline",
      "websr-real-life",
      "rt4ksr",
    ]);
    expect(plan.p2P3.matrix).toHaveLength(4);
  });

  it("accepts only a complete headless visual manifest", () => {
    expect(validateCanonicalVisualManifest(validManifest()).valid).toBe(true);
  });

  it("rejects headed or incomplete manifests", () => {
    const manifest = validManifest();
    manifest.headless = false;
    manifest.captures.pop();
    const result = validateCanonicalVisualManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/headed|capture/i);
  });
});
