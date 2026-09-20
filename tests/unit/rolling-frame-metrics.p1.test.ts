import { describe, expect, it } from "vitest";

import { RollingFrameMetrics } from "../../src/core/metrics/rollingFrameMetrics";

describe("RollingFrameMetrics P1 telemetry", () => {
  it("keeps only the newest 120 samples and reports nearest-rank percentiles", () => {
    const metrics = new RollingFrameMetrics();
    for (let value = 1; value <= 121; value += 1) {
      metrics.recordTiming({ processingMs: value, mainThreadMs: value / 10 });
    }

    expect(metrics.snapshot()).toMatchObject({
      windowSize: 120,
      sampleCount: 120,
      processingMs: { p50: 61, p95: 115, p99: 120 },
      mainThreadMs: { p50: 6.1, p95: 11.5, p99: 12 },
    });
  });

  it("tracks source gaps, unscheduled callbacks, stale results, and failures separately", () => {
    const metrics = new RollingFrameMetrics();
    metrics.observeSourceFrame(20);
    metrics.observeSourceFrame(23);
    metrics.recordPresented();
    metrics.recordDropped();
    metrics.recordDropped();
    metrics.recordStale();
    metrics.recordFailed();

    expect(metrics.snapshot()).toMatchObject({
      observedFrames: 2,
      presentedFrames: 1,
      missedFrames: 2,
      droppedFrames: 2,
      staleFrames: 1,
      failedFrames: 1,
    });
  });

  it("rejects invalid timings and resets counters and the source baseline", () => {
    const metrics = new RollingFrameMetrics();
    expect(() => metrics.recordTiming({ processingMs: Number.NaN })).toThrow(RangeError);
    expect(() => metrics.observeSourceFrame(-1)).toThrow(RangeError);

    metrics.observeSourceFrame(100);
    metrics.recordTiming({ processingMs: 3 });
    metrics.recordDropped();
    metrics.reset();
    metrics.observeSourceFrame(500);

    expect(metrics.snapshot()).toMatchObject({
      sampleCount: 0,
      observedFrames: 1,
      missedFrames: 0,
      droppedFrames: 0,
    });
  });
});
