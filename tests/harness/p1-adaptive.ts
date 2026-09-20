import { Anime4kBackend } from "../../src/core/gpu/anime4k-backend";
import type { PreparedFrame, QualityLevel } from "../../src/core/contracts";
import { RollingFrameMetrics } from "../../src/core/metrics/rollingFrameMetrics";
import { AdaptiveQualityController } from "../../src/core/scheduling/adaptiveQuality";
import {
  FrameScheduler,
  type VideoFrameCallbackSource,
  type VideoFrameMetadata,
} from "../../src/core/scheduling/frameScheduler";

const FRAME_BUDGET_MS = 24;
const OVERLOAD_TARGET_MS = 32.2;
const FPS = 30;
const WARMUP_FRAMES = 12;
const SETTLED_LOW_FRAMES = 120;

interface AdapterEvidence {
  info: { vendor: string; architecture: string; device: string; description: string };
  isFallbackAdapter: boolean | null;
  features: string[];
  limits: {
    maxTextureDimension2D: number;
    maxBufferSize: number;
    maxStorageBufferBindingSize: number;
  };
}

interface AdaptiveSample {
  frame: number;
  quality: QualityLevel;
  overloadApplied: boolean;
  processingMs: number;
  finishedAtMs: number;
}

interface AdaptiveTransition {
  type: "quality-change" | "bypass";
  from: QualityLevel | null;
  to: QualityLevel;
  reason: string;
  frame: number;
  timestampMs: number;
  processingMs: number;
  rollingP95Ms: number | null;
  overloadEnabledBefore: boolean;
}

interface AdaptiveResult {
  adapter: AdapterEvidence;
  browser: string;
  sourceMode: "synthetic-canvas-imagebitmap-adaptive";
  fps: 30;
  input: "1920x1080";
  output: "3840x2160";
  initialQuality: "high";
  finalQuality: QualityLevel;
  frameBudgetMs: number;
  overloadTargetMs: number;
  warmupFrames: number;
  settledLowFrameCount: number;
  rawSamplesMs: number[];
  samples: AdaptiveSample[];
  transitions: AdaptiveTransition[];
  overloadPhase: TimingSummary;
  settledLowPhase: TimingSummary;
  recoveryPhase: TimingSummary;
  counters: {
    observedFrames: number;
    presentedFrames: number;
    missedSourceFrames: number;
    skippedFrames: number;
    staleFrames: number;
    failedFrames: number;
    bypassCount: number;
    maxConcurrentPrepares: number;
  };
  controller: {
    finalLevel: QualityLevel;
    bypassRequested: boolean;
    recoveryWindowMs: number;
  };
  gpuErrors: string[];
  timestamp: string;
}

interface TimingSummary {
  firstFrame: number;
  lastFrame: number;
  sampleCount: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

interface Window {
  __P1_ADAPTIVE_RUN__?: (() => Promise<AdaptiveResult>) | undefined;
}

declare const window: Window & globalThis.Window;

const sourceCanvas = required<HTMLCanvasElement>("source-canvas");
const output = required<HTMLCanvasElement>("output");
drawFixture(sourceCanvas.getContext("2d", { alpha: false }));

window.__P1_ADAPTIVE_RUN__ = runAdaptiveBenchmark;

async function runAdaptiveBenchmark(): Promise<AdaptiveResult> {
  if (!navigator.gpu) throw new Error("WebGPU kullanılamıyor");
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("WebGPU adaptörü bulunamadı");
  const adapterEvidence = serializeAdapter(adapter);
  const device = await adapter.requestDevice();
  const gpuErrors: string[] = [];
  device.addEventListener("uncapturederror", (event) => gpuErrors.push(event.error.message));
  const canvasContext = output.getContext("webgpu") as GPUCanvasContext | null;
  if (!canvasContext) throw new Error("WebGPU canvas context oluşturulamadı");
  const backend = new Anime4kBackend();
  await backend.initialize({
    device,
    canvasContext,
    presentationFormat: navigator.gpu.getPreferredCanvasFormat(),
    initialInput: { width: 1920, height: 1080 },
    initialOutput: { width: 3840, height: 2160 },
    profile: "anime",
    qualityLevel: "high",
  });

  const source = new SyntheticVideoFrameSource(FPS, sourceCanvas.width, sourceCanvas.height);
  const metrics = new RollingFrameMetrics();
  const controller = new AdaptiveQualityController({
    targetFps: FPS,
    frameBudgetMs: FRAME_BUDGET_MS,
    downgradeConsecutiveFrames: 3,
    bypassConsecutiveFrames: 3,
    recoveryWindowMs: 5_000,
    upgradeHeadroomRatio: 0.75,
  });
  const samples: AdaptiveSample[] = [];
  const transitions: AdaptiveTransition[] = [];
  const gpuPreparedSamples: number[] = [];
  let overloadEnabled = true;
  let lastSample: AdaptiveSample | undefined;
  let concurrentPrepares = 0;
  let maxConcurrentPrepares = 0;
  let bypassCount = 0;
  let scheduler: FrameScheduler<SyntheticVideoFrameSource> | undefined;

  try {
    for (let index = 0; index < WARMUP_FRAMES; index += 1) {
      await source.waitForNextFrame();
      const prepared = await prepareCanvasFrame(backend);
      prepared.present();
    }

    let resolveRun!: () => void;
    let rejectRun!: (error: unknown) => void;
    const completed = new Promise<void>((resolve, reject) => {
      resolveRun = resolve;
      rejectRun = reject;
    });
    const timeout = window.setTimeout(
      () => rejectRun(new Error("Adaptive benchmark transition timeout.")),
      60_000,
    );

    scheduler = new FrameScheduler<SyntheticVideoFrameSource>({
      source,
      metrics,
      adaptiveQuality: controller,
      preparer: {
        prepare: async () => {
          concurrentPrepares += 1;
          maxConcurrentPrepares = Math.max(maxConcurrentPrepares, concurrentPrepares);
          const startedAt = performance.now();
          const quality = controller.getState().level;
          const overloadApplied = overloadEnabled && quality === "high";
          try {
            const prepared = await prepareCanvasFrame(backend);
            const gpuReadyAt = performance.now();
            gpuPreparedSamples.push(gpuReadyAt - startedAt);
            if (overloadApplied) {
              const remaining = OVERLOAD_TARGET_MS - (gpuReadyAt - startedAt);
              if (remaining > 0) await wait(remaining);
            }
            return prepared;
          } finally {
            const finishedAtMs = performance.now();
            const sample: AdaptiveSample = {
              frame: source.currentFrame,
              quality,
              overloadApplied,
              processingMs: finishedAtMs - startedAt,
              finishedAtMs,
            };
            samples.push(sample);
            lastSample = sample;
            concurrentPrepares -= 1;
          }
        },
      },
      onQualityDecision: (decision) => {
        const sample = lastSample;
        const state = controller.getState();
        if (!sample || decision.type === "keep") return;
        if (decision.type === "bypass") bypassCount += 1;
        transitions.push({
          type: decision.type === "bypass" ? "bypass" : "quality-change",
          from: decision.type === "bypass" ? "low" : decision.from,
          to: decision.type === "bypass" ? "low" : decision.to,
          reason: decision.reason,
          frame: sample.frame,
          timestampMs: sample.finishedAtMs,
          processingMs: sample.processingMs,
          rollingP95Ms: state.rollingP95Ms,
          overloadEnabledBefore: overloadEnabled,
        });
        if (decision.type === "bypass") {
          scheduler?.stop();
          rejectRun(new Error("Adaptive controller requested bypass during low settle."));
          return;
        }
        if (decision.from === "high" && decision.to === "low") {
          // The controller made the downgrade. Releasing the deterministic
          // overload here is part of the fixture, not a forced quality write.
          overloadEnabled = false;
        }
        if (decision.from === "low" && decision.to === "high") {
          scheduler?.stop();
          resolveRun();
        }
      },
      onError: (error) => {
        scheduler?.stop();
        rejectRun(error);
      },
    });
    scheduler.start();

    try {
      await completed;
    } finally {
      window.clearTimeout(timeout);
      scheduler.stop();
    }
    await device.queue.onSubmittedWorkDone();

    const downgrade = transitions.find(
      (transition) => transition.from === "high" && transition.to === "low",
    );
    const recovery = transitions.find(
      (transition) => transition.from === "low" && transition.to === "high",
    );
    if (!downgrade) throw new Error("Adaptive controller did not downgrade high→low.");
    if (!recovery) throw new Error("Adaptive controller did not recover low→high.");
    const lowSamples = samples.filter(
      (sample) => sample.frame > downgrade.frame && sample.frame <= recovery.frame,
    );
    if (lowSamples.length < SETTLED_LOW_FRAMES) {
      throw new Error(`Settled low sample count ${lowSamples.length} < ${SETTLED_LOW_FRAMES}.`);
    }
    const settledLowSamples = lowSamples.slice(0, SETTLED_LOW_FRAMES);
    const overloadSamples = samples.filter((sample) => sample.overloadApplied);
    const finalState = controller.getState();
    const snapshot = metrics.snapshot();
    const result: AdaptiveResult = {
      adapter: adapterEvidence,
      browser: navigator.userAgent,
      sourceMode: "synthetic-canvas-imagebitmap-adaptive",
      fps: FPS,
      input: "1920x1080",
      output: "3840x2160",
      initialQuality: "high",
      finalQuality: finalState.level,
      frameBudgetMs: FRAME_BUDGET_MS,
      overloadTargetMs: OVERLOAD_TARGET_MS,
      warmupFrames: WARMUP_FRAMES,
      settledLowFrameCount: settledLowSamples.length,
      rawSamplesMs: samples.map(({ processingMs }) => processingMs),
      samples,
      transitions,
      overloadPhase: summarize(overloadSamples),
      settledLowPhase: summarize(settledLowSamples),
      recoveryPhase: summarize(lowSamples),
      counters: {
        observedFrames: snapshot.observedFrames,
        presentedFrames: snapshot.presentedFrames,
        missedSourceFrames: snapshot.missedFrames,
        skippedFrames: snapshot.droppedFrames,
        staleFrames: snapshot.staleFrames,
        failedFrames: snapshot.failedFrames,
        bypassCount,
        maxConcurrentPrepares,
      },
      controller: {
        finalLevel: finalState.level,
        bypassRequested: finalState.bypassRequested,
        recoveryWindowMs: 5_000,
      },
      gpuErrors,
      timestamp: new Date().toISOString(),
    };
    if (gpuPreparedSamples.length === 0) throw new Error("GPU prep samples missing.");
    return result;
  } finally {
    scheduler?.stop();
    backend.dispose();
  }
}

class SyntheticVideoFrameSource implements VideoFrameCallbackSource {
  private nextHandle = 1;
  private presentedFrames = 0;
  private readonly timers = new Map<number, number>();

  constructor(
    private readonly fps: number,
    private readonly width: number,
    private readonly height: number,
  ) {}

  get currentFrame(): number {
    return this.presentedFrames;
  }

  requestVideoFrameCallback(callback: (now: number, metadata: VideoFrameMetadata) => void): number {
    const handle = this.nextHandle++;
    const timer = window.setTimeout(() => {
      this.timers.delete(handle);
      this.presentedFrames += 1;
      const now = performance.now();
      callback(now, {
        mediaTime: this.presentedFrames / this.fps,
        expectedDisplayTime: now,
        presentedFrames: this.presentedFrames,
        width: this.width,
        height: this.height,
      });
    }, 1000 / this.fps);
    this.timers.set(handle, timer);
    return handle;
  }

  cancelVideoFrameCallback(handle: number): void {
    const timer = this.timers.get(handle);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    this.timers.delete(handle);
  }

  waitForNextFrame(): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, 1000 / this.fps));
  }
}

async function prepareCanvasFrame(backend: Anime4kBackend): Promise<PreparedFrame> {
  const frame = await createImageBitmap(sourceCanvas);
  try {
    const prepared = await backend.prepare(frame);
    return {
      stats: prepared.stats,
      present: () => {
        try {
          prepared.present();
        } finally {
          frame.close();
        }
      },
      discard: () => {
        try {
          prepared.discard();
        } finally {
          frame.close();
        }
      },
    };
  } catch (error) {
    frame.close();
    throw error;
  }
}

function summarize(samples: readonly AdaptiveSample[]): TimingSummary {
  const values = samples.map(({ processingMs }) => processingMs);
  const sorted = [...values].sort((left, right) => left - right);
  return {
    firstFrame: samples[0]?.frame ?? 0,
    lastFrame: samples.at(-1)?.frame ?? 0,
    sampleCount: samples.length,
    p50Ms: nearestRank(sorted, 0.5),
    p95Ms: nearestRank(sorted, 0.95),
    p99Ms: nearestRank(sorted, 0.99),
  };
}

function nearestRank(sorted: readonly number[], percentile: number): number {
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)] ?? 0;
}

function serializeAdapter(adapter: GPUAdapter): AdapterEvidence {
  const info = adapter.info;
  const adapterWithFallback = adapter as GPUAdapter & { isFallbackAdapter?: boolean };
  return {
    info: {
      vendor: info.vendor,
      architecture: info.architecture,
      device: info.device,
      description: info.description,
    },
    isFallbackAdapter:
      typeof adapterWithFallback.isFallbackAdapter === "boolean"
        ? adapterWithFallback.isFallbackAdapter
        : null,
    features: [...adapter.features].sort(),
    limits: {
      maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
      maxBufferSize: adapter.limits.maxBufferSize,
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    },
  };
}

function drawFixture(context: CanvasRenderingContext2D | null): void {
  if (!context) throw new Error("2D test canvas oluşturulamadı");
  context.fillStyle = "#ece7db";
  context.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  context.fillStyle = "#172532";
  context.beginPath();
  context.arc(340, 290, 190, Math.PI * 0.15, Math.PI * 1.85);
  context.lineTo(340, 290);
  context.fill();
  context.strokeStyle = "#080b10";
  context.lineWidth = 12;
  context.stroke();
  context.strokeStyle = "#101820";
  for (let offset = -80; offset < 540; offset += 28) {
    context.lineWidth = offset % 56 === 0 ? 2 : 7;
    context.beginPath();
    context.moveTo(560 + offset, 80);
    context.lineTo(960 + offset, 500);
    context.stroke();
  }
  context.fillStyle = "#ea284c";
  context.fillRect(0, 540, 480, 540);
  context.fillStyle = "#1d66e5";
  context.fillRect(480, 540, 480, 540);
  context.fillStyle = "#d7a07f";
  context.beginPath();
  context.arc(480, 810, 150, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#241a20";
  context.lineWidth = 9;
  context.stroke();
  context.fillStyle = "#20252f";
  context.fillRect(960, 540, 960, 540);
  context.strokeStyle = "#f4e8c2";
  context.lineWidth = 2;
  for (let x = 960; x < 1940; x += 12) {
    context.beginPath();
    context.moveTo(x, 540);
    context.lineTo(x + 220, 1080);
    context.stroke();
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Eksik adaptive benchmark elementi: ${id}`);
  return element as T;
}
