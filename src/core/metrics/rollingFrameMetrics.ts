export interface PercentileSummary {
  readonly p50: number | null;
  readonly p95: number | null;
  readonly p99: number | null;
}

export interface FrameTimingSample {
  readonly processingMs: number;
  readonly mainThreadMs?: number;
}

export interface FrameMetricsSnapshot {
  readonly windowSize: number;
  readonly sampleCount: number;
  readonly processingMs: PercentileSummary;
  readonly mainThreadMs: PercentileSummary;
  readonly observedFrames: number;
  readonly presentedFrames: number;
  readonly missedFrames: number;
  readonly droppedFrames: number;
  readonly staleFrames: number;
  readonly failedFrames: number;
}

const EMPTY_PERCENTILES: PercentileSummary = {
  p50: null,
  p95: null,
  p99: null,
};

/**
 * Local-only rolling frame telemetry. The collector deliberately keeps no
 * source frame data and bounds all timing storage to the configured window.
 */
export class RollingFrameMetrics {
  readonly windowSize: number;

  private readonly timingSamples: FrameTimingSample[] = [];
  private lastSourcePresentedFrames: number | null = null;
  private observedFrames = 0;
  private presentedFrames = 0;
  private missedFrames = 0;
  private droppedFrames = 0;
  private staleFrames = 0;
  private failedFrames = 0;

  constructor(windowSize = 120) {
    if (!Number.isInteger(windowSize) || windowSize <= 0) {
      throw new RangeError("windowSize must be a positive integer");
    }

    this.windowSize = windowSize;
  }

  observeSourceFrame(sourcePresentedFrames: number): void {
    if (!Number.isSafeInteger(sourcePresentedFrames) || sourcePresentedFrames < 0) {
      throw new RangeError("sourcePresentedFrames must be a non-negative integer");
    }

    this.observedFrames += 1;

    if (
      this.lastSourcePresentedFrames !== null &&
      sourcePresentedFrames > this.lastSourcePresentedFrames + 1
    ) {
      this.missedFrames += sourcePresentedFrames - this.lastSourcePresentedFrames - 1;
    }

    this.lastSourcePresentedFrames = sourcePresentedFrames;
  }

  recordTiming(sample: FrameTimingSample): void {
    assertFiniteNonNegative(sample.processingMs, "processingMs");
    if (sample.mainThreadMs !== undefined) {
      assertFiniteNonNegative(sample.mainThreadMs, "mainThreadMs");
    }

    this.timingSamples.push({ ...sample });
    if (this.timingSamples.length > this.windowSize) {
      this.timingSamples.shift();
    }
  }

  recordPresented(): void {
    this.presentedFrames += 1;
  }

  recordDropped(): void {
    this.droppedFrames += 1;
  }

  recordStale(): void {
    this.staleFrames += 1;
  }

  recordFailed(): void {
    this.failedFrames += 1;
  }

  snapshot(): FrameMetricsSnapshot {
    return {
      windowSize: this.windowSize,
      sampleCount: this.timingSamples.length,
      processingMs: summarize(this.timingSamples.map(({ processingMs }) => processingMs)),
      mainThreadMs: summarize(
        this.timingSamples.flatMap(({ mainThreadMs }) =>
          mainThreadMs === undefined ? [] : [mainThreadMs],
        ),
      ),
      observedFrames: this.observedFrames,
      presentedFrames: this.presentedFrames,
      missedFrames: this.missedFrames,
      droppedFrames: this.droppedFrames,
      staleFrames: this.staleFrames,
      failedFrames: this.failedFrames,
    };
  }

  reset(): void {
    this.timingSamples.length = 0;
    this.lastSourcePresentedFrames = null;
    this.observedFrames = 0;
    this.presentedFrames = 0;
    this.missedFrames = 0;
    this.droppedFrames = 0;
    this.staleFrames = 0;
    this.failedFrames = 0;
  }
}

function summarize(values: readonly number[]): PercentileSummary {
  if (values.length === 0) {
    return EMPTY_PERCENTILES;
  }

  const sorted = [...values].sort((left, right) => left - right);
  return {
    p50: nearestRank(sorted, 0.5),
    p95: nearestRank(sorted, 0.95),
    p99: nearestRank(sorted, 0.99),
  };
}

function nearestRank(sortedValues: readonly number[], percentile: number): number {
  const index = Math.max(0, Math.ceil(percentile * sortedValues.length) - 1);
  // summarize() guards the empty case before calling this helper.
  return sortedValues[index] ?? 0;
}

function assertFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite, non-negative number`);
  }
}
