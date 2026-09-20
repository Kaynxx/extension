import { describe, expect, it } from "vitest";
import { P4_TEMPORAL_THRESHOLDS } from "../../src/core/scheduling/temporalAcceptance";

describe("P4 temporal acceptance gates", () => {
  it("keeps conservative pre-registered thresholds", () => {
    expect(P4_TEMPORAL_THRESHOLDS.shimmerImprovementMin).toBe(0.1);
    expect(P4_TEMPORAL_THRESHOLDS.maxSceneCutLeakage).toBe(0.08);
    expect(P4_TEMPORAL_THRESHOLDS.maxGhostError).toBe(0.12);
    expect(P4_TEMPORAL_THRESHOLDS.p95Ms30).toBe(24);
    expect(P4_TEMPORAL_THRESHOLDS.p95Ms60).toBe(16.7);
  });
});
