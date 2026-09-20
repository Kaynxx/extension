import type { PreparedFrame } from "../contracts";
import type { RollingFrameMetrics } from "../metrics";
import type { AdaptiveQualityController, AdaptiveQualityDecision } from "./adaptiveQuality";
import { TemporalStateBoundary, type TemporalResetReason } from "./temporalState";

export interface VideoFrameMetadata {
  readonly mediaTime: number;
  readonly presentedFrames: number;
  readonly expectedDisplayTime?: number;
  readonly width?: number;
  readonly height?: number;
}

export type VideoFrameCallback = (now: number, metadata: VideoFrameMetadata) => void;

export interface VideoFrameCallbackSource {
  requestVideoFrameCallback(callback: VideoFrameCallback): number;
  cancelVideoFrameCallback(handle: number): void;
}

export interface FramePreparer<TSource extends VideoFrameCallbackSource> {
  prepare(source: TSource): Promise<PreparedFrame>;
}

export interface MonotonicClock {
  now(): number;
}

export interface FrameSchedulerOptions<TSource extends VideoFrameCallbackSource> {
  readonly source: TSource;
  readonly preparer: FramePreparer<TSource>;
  readonly metrics: RollingFrameMetrics;
  readonly adaptiveQuality?: AdaptiveQualityController;
  readonly clock?: MonotonicClock;
  readonly onQualityDecision?: (decision: AdaptiveQualityDecision) => void;
  readonly onPresented?: () => void;
  readonly onError?: (error: unknown) => void;
  /** Reset-only hook for a future temporal model; no temporal inference is performed here. */
  readonly onTemporalReset?: (reason: TemporalResetReason) => void;
}

/**
 * requestVideoFrameCallback scheduler with at most one render in flight.
 * Incoming callbacks are still observed while rendering, but they never create
 * pending work. A completed frame is committed only when no newer source frame
 * has arrived in the meantime.
 */
export class FrameScheduler<TSource extends VideoFrameCallbackSource> {
  private readonly source: TSource;
  private readonly preparer: FramePreparer<TSource>;
  private readonly metrics: RollingFrameMetrics;
  private readonly adaptiveQuality: AdaptiveQualityController | undefined;
  private readonly clock: MonotonicClock;
  private readonly onQualityDecision: ((decision: AdaptiveQualityDecision) => void) | undefined;
  private readonly onPresented: (() => void) | undefined;
  private readonly onError: ((error: unknown) => void) | undefined;
  private readonly onTemporalReset: ((reason: TemporalResetReason) => void) | undefined;
  private readonly temporalState = new TemporalStateBoundary();

  private callbackHandle: number | null = null;
  private running = false;
  private inFlight = false;
  private generation = 0;
  private runEpoch = 0;

  constructor(options: FrameSchedulerOptions<TSource>) {
    this.source = options.source;
    this.preparer = options.preparer;
    this.metrics = options.metrics;
    this.adaptiveQuality = options.adaptiveQuality;
    this.clock = options.clock ?? performance;
    this.onQualityDecision = options.onQualityDecision;
    this.onPresented = options.onPresented;
    this.onError = options.onError;
    this.onTemporalReset = options.onTemporalReset;
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.runEpoch += 1;
    this.scheduleNextCallback(this.runEpoch);
  }

  stop(): void {
    if (!this.running && this.callbackHandle === null) {
      return;
    }

    this.running = false;
    this.runEpoch += 1;
    if (this.callbackHandle !== null) {
      this.source.cancelVideoFrameCallback(this.callbackHandle);
      this.callbackHandle = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  /** Invalidates in-flight work so temporal state cannot cross a boundary. */
  resetTemporal(reason: TemporalResetReason): void {
    this.generation += 1;
    this.temporalState.reset(reason);
    this.onTemporalReset?.(reason);
  }

  private scheduleNextCallback(epoch: number): void {
    if (!this.running || epoch !== this.runEpoch) {
      return;
    }

    this.callbackHandle = this.source.requestVideoFrameCallback((now, metadata) => {
      this.callbackHandle = null;
      this.handleVideoFrame(now, metadata, epoch);
    });
  }

  private handleVideoFrame(
    _callbackNow: number,
    metadata: VideoFrameMetadata,
    epoch: number,
  ): void {
    if (!this.running || epoch !== this.runEpoch) {
      return;
    }

    // Keep observing source cadence during GPU work. This lets a newer frame
    // invalidate the in-flight result without enqueuing another render.
    this.scheduleNextCallback(epoch);
    this.metrics.observeSourceFrame(metadata.presentedFrames);
    const discontinuity = this.temporalState.observe(metadata);
    if (discontinuity !== undefined) this.resetTemporal(discontinuity);
    const frameGeneration = ++this.generation;

    if (this.inFlight) {
      this.metrics.recordDropped();
      return;
    }

    this.inFlight = true;
    void this.prepareAndMaybePresent(frameGeneration, epoch);
  }

  private async prepareAndMaybePresent(frameGeneration: number, epoch: number): Promise<void> {
    const startedAt = this.clock.now();
    let prepared: PreparedFrame | null = null;
    let pendingTemporalReset: TemporalResetReason | undefined;

    try {
      prepared = await this.preparer.prepare(this.source);
      const finishedAt = this.clock.now();
      const processingMs = Math.max(0, finishedAt - startedAt);
      const mainThreadMs = finiteNonNegativeOrUndefined(prepared.stats.cpuSubmitMs);
      this.metrics.recordTiming(
        mainThreadMs === undefined ? { processingMs } : { processingMs, mainThreadMs },
      );

      const qualityDecision = this.adaptiveQuality?.observe({
        processingMs,
        timestampMs: finishedAt,
      });
      if (qualityDecision && qualityDecision.type !== "keep") {
        pendingTemporalReset =
          qualityDecision.type === "quality-change" ? "quality-change" : "manual";
        this.onQualityDecision?.(qualityDecision);
      }

      if (qualityDecision?.type === "bypass") {
        prepared.discard();
        prepared = null;
        this.metrics.recordDropped();
        this.stop();
        return;
      }

      const isStale =
        !this.running || epoch !== this.runEpoch || frameGeneration !== this.generation;
      if (isStale) {
        prepared.discard();
        prepared = null;
        this.metrics.recordStale();
        return;
      }
      prepared.present();
      prepared = null;
      this.metrics.recordPresented();
      this.onPresented?.();
      // Keep the boundary frame visible, then invalidate subsequent work.
      if (pendingTemporalReset !== undefined) this.resetTemporal(pendingTemporalReset);
    } catch (error) {
      if (prepared) {
        try {
          prepared.discard();
        } catch {
          // Preserve the original prepare/present failure for the caller.
        }
      }
      this.metrics.recordFailed();
      this.onError?.(error);
    } finally {
      this.inFlight = false;
    }
  }
}

function finiteNonNegativeOrUndefined(value: number | null | undefined): number | undefined {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}
