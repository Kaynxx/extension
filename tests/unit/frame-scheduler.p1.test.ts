import { describe, expect, it, vi } from "vitest";

import type { PreparedFrame, RenderStats } from "../../src/core/contracts";
import { RollingFrameMetrics } from "../../src/core/metrics/rollingFrameMetrics";
import {
  FrameScheduler,
  type VideoFrameCallback,
  type VideoFrameCallbackSource,
} from "../../src/core/scheduling/frameScheduler";
import { AdaptiveQualityController } from "../../src/core/scheduling/adaptiveQuality";

class ManualVideoSource implements VideoFrameCallbackSource {
  private nextHandle = 1;
  private readonly callbacks = new Map<number, VideoFrameCallback>();

  requestVideoFrameCallback(callback: VideoFrameCallback): number {
    const handle = this.nextHandle++;
    this.callbacks.set(handle, callback);
    return handle;
  }

  cancelVideoFrameCallback(handle: number): void {
    this.callbacks.delete(handle);
  }

  emit(presentedFrames: number, now = presentedFrames): void {
    const entry = this.callbacks.entries().next();
    if (entry.done) throw new Error("No video frame callback is registered");
    const [handle, callback] = entry.value;
    this.callbacks.delete(handle);
    callback(now, { mediaTime: now / 1_000, presentedFrames });
  }

  get pendingCallbacks(): number {
    return this.callbacks.size;
  }
}

function preparedFrame() {
  const present = vi.fn();
  const discard = vi.fn();
  const stats: RenderStats = {
    qualityLevel: "high",
    cpuSubmitMs: 2,
    gpuTimeMs: 8,
    inputSize: { width: 1_920, height: 1_080 },
    outputSize: { width: 3_840, height: 2_160 },
    passCount: 2,
  };
  return { frame: { stats, present, discard } satisfies PreparedFrame, present, discard };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("FrameScheduler P1 latest-frame-wins behavior", () => {
  it("allows only one prepare, queues no replacement, and discards a stale result", async () => {
    const source = new ManualVideoSource();
    const metrics = new RollingFrameMetrics();
    const first = deferred<PreparedFrame>();
    const prepared = preparedFrame();
    const prepare = vi.fn(() => first.promise);
    const scheduler = new FrameScheduler({ source, preparer: { prepare }, metrics });

    scheduler.start();
    source.emit(10);
    source.emit(11);
    source.emit(12);

    expect(prepare).toHaveBeenCalledTimes(1);
    expect(source.pendingCallbacks).toBe(1);
    first.resolve(prepared.frame);
    await flushMicrotasks();

    expect(prepared.present).not.toHaveBeenCalled();
    expect(prepared.discard).toHaveBeenCalledTimes(1);
    expect(metrics.snapshot()).toMatchObject({
      observedFrames: 3,
      droppedFrames: 2,
      staleFrames: 1,
      presentedFrames: 0,
    });
  });

  it("presents a prepared frame only when it is still latest", async () => {
    const source = new ManualVideoSource();
    const metrics = new RollingFrameMetrics();
    const prepared = preparedFrame();
    const onPresented = vi.fn();
    let now = 100;
    const scheduler = new FrameScheduler({
      source,
      preparer: { prepare: vi.fn(() => Promise.resolve(prepared.frame)) },
      metrics,
      clock: { now: () => (now += 5) },
      onPresented,
    });

    scheduler.start();
    source.emit(1);
    await flushMicrotasks();

    expect(prepared.present).toHaveBeenCalledTimes(1);
    expect(prepared.discard).not.toHaveBeenCalled();
    expect(onPresented).toHaveBeenCalledTimes(1);
    expect(metrics.snapshot()).toMatchObject({
      sampleCount: 1,
      processingMs: { p50: 5, p95: 5, p99: 5 },
      mainThreadMs: { p50: 2, p95: 2, p99: 2 },
      presentedFrames: 1,
    });
  });

  it("invalidates in-flight work on stop and cancels its outstanding callback", async () => {
    const source = new ManualVideoSource();
    const metrics = new RollingFrameMetrics();
    const pending = deferred<PreparedFrame>();
    const prepared = preparedFrame();
    const scheduler = new FrameScheduler({
      source,
      preparer: { prepare: () => pending.promise },
      metrics,
    });

    scheduler.start();
    source.emit(1);
    scheduler.stop();
    expect(source.pendingCallbacks).toBe(0);
    pending.resolve(prepared.frame);
    await flushMicrotasks();

    expect(prepared.discard).toHaveBeenCalledTimes(1);
    expect(prepared.present).not.toHaveBeenCalled();
    expect(metrics.snapshot().staleFrames).toBe(1);
  });

  it("reports prepare failures and continues observing later frames", async () => {
    const source = new ManualVideoSource();
    const metrics = new RollingFrameMetrics();
    const onError = vi.fn();
    const error = new Error("device lost");
    const scheduler = new FrameScheduler({
      source,
      preparer: { prepare: vi.fn().mockRejectedValue(error) },
      metrics,
      onError,
    });

    scheduler.start();
    source.emit(1);
    await flushMicrotasks();
    source.emit(2);
    await flushMicrotasks();

    expect(onError).toHaveBeenCalledTimes(2);
    expect(metrics.snapshot()).toMatchObject({ failedFrames: 2, observedFrames: 2 });
  });

  it("stops scheduling and leaves the low-quality over-budget frame hidden", async () => {
    const source = new ManualVideoSource();
    const metrics = new RollingFrameMetrics();
    const first = preparedFrame();
    const second = preparedFrame();
    const prepare = vi.fn().mockResolvedValueOnce(first.frame).mockResolvedValueOnce(second.frame);
    const timestamps = [0, 30, 30, 60];
    const onQualityDecision = vi.fn();
    const scheduler = new FrameScheduler({
      source,
      preparer: { prepare },
      metrics,
      adaptiveQuality: new AdaptiveQualityController({
        frameBudgetMs: 20,
        downgradeConsecutiveFrames: 1,
        bypassConsecutiveFrames: 1,
      }),
      clock: { now: () => timestamps.shift() ?? 60 },
      onQualityDecision,
    });

    scheduler.start();
    source.emit(1);
    await flushMicrotasks();
    source.emit(2);
    await flushMicrotasks();

    expect(first.present).toHaveBeenCalledTimes(1);
    expect(second.present).not.toHaveBeenCalled();
    expect(second.discard).toHaveBeenCalledTimes(1);
    expect(scheduler.isRunning()).toBe(false);
    expect(source.pendingCallbacks).toBe(0);
    expect(onQualityDecision).toHaveBeenLastCalledWith({
      type: "bypass",
      level: "low",
      reason: "low-quality-over-budget",
    });
  });
});
