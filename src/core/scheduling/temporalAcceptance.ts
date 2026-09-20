/** Conservative P4 gates declared before any headed measurement is inspected. */
export const P4_TEMPORAL_THRESHOLDS = Object.freeze({
  shimmerImprovementMin: 0.1,
  maxSceneCutLeakage: 0.08,
  maxGhostError: 0.12,
  p95Ms30: 24,
  p95Ms60: 16.7,
});
