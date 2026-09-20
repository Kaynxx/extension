import { describe, expect, it } from "vitest";

import { AdaptiveQualityController } from "../../src/core/scheduling/adaptiveQuality";

describe("AdaptiveQualityController P1 policy", () => {
  it("starts high and quickly falls to low after consecutive rolling-p95 overruns", () => {
    const controller = new AdaptiveQualityController({
      frameBudgetMs: 20,
      downgradeConsecutiveFrames: 3,
    });

    expect(controller.getState().level).toBe("high");
    expect(controller.observe({ processingMs: 21, timestampMs: 0 }).type).toBe("keep");
    expect(controller.observe({ processingMs: 22, timestampMs: 1 }).type).toBe("keep");
    expect(controller.observe({ processingMs: 23, timestampMs: 2 })).toEqual({
      type: "quality-change",
      from: "high",
      to: "low",
      reason: "sustained-over-budget",
    });
  });

  it("requests bypass when low quality also remains over budget", () => {
    const controller = new AdaptiveQualityController({
      frameBudgetMs: 20,
      downgradeConsecutiveFrames: 2,
      bypassConsecutiveFrames: 3,
    });
    controller.observe({ processingMs: 30, timestampMs: 0 });
    controller.observe({ processingMs: 30, timestampMs: 1 });

    controller.observe({ processingMs: 25, timestampMs: 2 });
    controller.observe({ processingMs: 25, timestampMs: 3 });
    expect(controller.observe({ processingMs: 25, timestampMs: 4 })).toEqual({
      type: "bypass",
      level: "low",
      reason: "low-quality-over-budget",
    });
    expect(controller.getState().bypassRequested).toBe(true);
    expect(controller.observe({ processingMs: 25, timestampMs: 5 })).toEqual({
      type: "keep",
      level: "low",
    });
  });

  it("requires a fresh uninterrupted five-second headroom interval before upgrading", () => {
    const controller = new AdaptiveQualityController({
      frameBudgetMs: 20,
      downgradeConsecutiveFrames: 1,
      recoveryWindowMs: 5_000,
      upgradeHeadroomRatio: 0.75,
    });
    controller.observe({ processingMs: 30, timestampMs: 0 });

    controller.observe({ processingMs: 10, timestampMs: 100 });
    controller.observe({ processingMs: 16, timestampMs: 4_000 });
    controller.observe({ processingMs: 10, timestampMs: 4_100 });
    expect(controller.observe({ processingMs: 10, timestampMs: 9_099 }).type).toBe("keep");
    expect(controller.observe({ processingMs: 10, timestampMs: 9_100 })).toEqual({
      type: "quality-change",
      from: "low",
      to: "high",
      reason: "sustained-headroom",
    });
  });

  it("derives configurable 24 and 30 FPS budgets and accepts an explicit override", () => {
    expect(new AdaptiveQualityController({ targetFps: 24 }).frameBudgetMs).toBeCloseTo(1_000 / 24);
    expect(new AdaptiveQualityController({ targetFps: 30 }).frameBudgetMs).toBeCloseTo(1_000 / 30);
    expect(new AdaptiveQualityController({ targetFps: 30, frameBudgetMs: 22 }).frameBudgetMs).toBe(
      22,
    );
  });
});
