import type { QualityLevel } from "../contracts";

export interface AdaptiveQualityConfig {
  /** Target video cadence. Ignored when frameBudgetMs is provided. */
  readonly targetFps?: 24 | 30;
  /** Explicit processing budget, useful when reserving time for composition. */
  readonly frameBudgetMs?: number;
  readonly downgradeConsecutiveFrames?: number;
  readonly bypassConsecutiveFrames?: number;
  readonly recoveryWindowMs?: number;
  readonly upgradeHeadroomRatio?: number;
}

export interface AdaptiveQualitySample {
  readonly processingMs: number;
  readonly timestampMs: number;
}

export type AdaptiveQualityDecision =
  | { readonly type: "keep"; readonly level: QualityLevel }
  | {
      readonly type: "quality-change";
      readonly from: QualityLevel;
      readonly to: QualityLevel;
      readonly reason: "sustained-over-budget" | "sustained-headroom";
    }
  | {
      readonly type: "bypass";
      readonly level: "low";
      readonly reason: "low-quality-over-budget";
    };

export interface AdaptiveQualityState {
  readonly level: QualityLevel;
  readonly frameBudgetMs: number;
  readonly rollingP95Ms: number | null;
  readonly overBudgetStreak: number;
  readonly stableSinceMs: number | null;
  readonly bypassRequested: boolean;
}

const WINDOW_SIZE = 120;

/**
 * Two-level quality controller with asymmetric thresholds: quality drops
 * quickly, while recovery requires a continuous stable headroom interval.
 */
export class AdaptiveQualityController {
  readonly frameBudgetMs: number;

  private readonly downgradeConsecutiveFrames: number;
  private readonly bypassConsecutiveFrames: number;
  private readonly recoveryWindowMs: number;
  private readonly upgradeThresholdMs: number;
  private readonly samples: number[] = [];

  private level: QualityLevel = "high";
  private overBudgetStreak = 0;
  private stableSinceMs: number | null = null;
  private lastTimestampMs: number | null = null;
  private bypassRequested = false;

  constructor(config: AdaptiveQualityConfig = {}) {
    const targetFps = config.targetFps ?? 30;
    this.frameBudgetMs = config.frameBudgetMs ?? 1_000 / targetFps;
    this.downgradeConsecutiveFrames = config.downgradeConsecutiveFrames ?? 3;
    this.bypassConsecutiveFrames = config.bypassConsecutiveFrames ?? 3;
    this.recoveryWindowMs = config.recoveryWindowMs ?? 5_000;
    const upgradeHeadroomRatio = config.upgradeHeadroomRatio ?? 0.75;
    this.upgradeThresholdMs = this.frameBudgetMs * upgradeHeadroomRatio;

    assertPositiveFinite(this.frameBudgetMs, "frameBudgetMs");
    assertPositiveInteger(this.downgradeConsecutiveFrames, "downgradeConsecutiveFrames");
    assertPositiveInteger(this.bypassConsecutiveFrames, "bypassConsecutiveFrames");
    assertPositiveFinite(this.recoveryWindowMs, "recoveryWindowMs");
    if (
      !Number.isFinite(upgradeHeadroomRatio) ||
      upgradeHeadroomRatio <= 0 ||
      upgradeHeadroomRatio >= 1
    ) {
      throw new RangeError("upgradeHeadroomRatio must be greater than 0 and less than 1");
    }
  }

  observe(sample: AdaptiveQualitySample): AdaptiveQualityDecision {
    assertFiniteNonNegative(sample.processingMs, "processingMs");
    assertFiniteNonNegative(sample.timestampMs, "timestampMs");

    if (this.lastTimestampMs !== null && sample.timestampMs < this.lastTimestampMs) {
      this.stableSinceMs = null;
    }
    this.lastTimestampMs = sample.timestampMs;

    this.samples.push(sample.processingMs);
    if (this.samples.length > WINDOW_SIZE) {
      this.samples.shift();
    }

    const rollingP95Ms = percentile95(this.samples);
    if (rollingP95Ms > this.frameBudgetMs) {
      this.overBudgetStreak += 1;
      this.stableSinceMs = null;
    } else {
      this.overBudgetStreak = 0;
    }

    if (this.level === "high") {
      if (this.overBudgetStreak >= this.downgradeConsecutiveFrames) {
        this.level = "low";
        this.resetLevelWindow();
        return {
          type: "quality-change",
          from: "high",
          to: "low",
          reason: "sustained-over-budget",
        };
      }

      return { type: "keep", level: this.level };
    }

    if (this.bypassRequested) {
      return { type: "keep", level: this.level };
    }

    if (this.overBudgetStreak >= this.bypassConsecutiveFrames) {
      this.bypassRequested = true;
      this.stableSinceMs = null;
      return {
        type: "bypass",
        level: "low",
        reason: "low-quality-over-budget",
      };
    }

    if (rollingP95Ms <= this.frameBudgetMs && sample.processingMs <= this.upgradeThresholdMs) {
      this.stableSinceMs ??= sample.timestampMs;
      if (sample.timestampMs - this.stableSinceMs >= this.recoveryWindowMs) {
        this.level = "high";
        this.resetLevelWindow();
        return {
          type: "quality-change",
          from: "low",
          to: "high",
          reason: "sustained-headroom",
        };
      }
    } else {
      this.stableSinceMs = null;
    }

    return { type: "keep", level: this.level };
  }

  getState(): AdaptiveQualityState {
    return {
      level: this.level,
      frameBudgetMs: this.frameBudgetMs,
      rollingP95Ms: this.samples.length === 0 ? null : percentile95(this.samples),
      overBudgetStreak: this.overBudgetStreak,
      stableSinceMs: this.stableSinceMs,
      bypassRequested: this.bypassRequested,
    };
  }

  reset(): void {
    this.level = "high";
    this.bypassRequested = false;
    this.lastTimestampMs = null;
    this.resetLevelWindow();
  }

  private resetLevelWindow(): void {
    this.samples.length = 0;
    this.overBudgetStreak = 0;
    this.stableSinceMs = null;
  }
}

function percentile95(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite number greater than 0`);
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}

function assertFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite, non-negative number`);
  }
}
