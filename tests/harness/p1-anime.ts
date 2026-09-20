import { Anime4kBackend } from "../../src/core/gpu/anime4k-backend";
import type { QualityLevel } from "../../src/core/contracts";
import { RollingFrameMetrics } from "../../src/core/metrics/rollingFrameMetrics";
import {
  FrameScheduler,
  type VideoFrameCallbackSource,
  type VideoFrameMetadata,
} from "../../src/core/scheduling/frameScheduler";

interface AdapterEvidence {
  info: {
    vendor: string;
    architecture: string;
    device: string;
    description: string;
  };
  isFallbackAdapter: boolean | null;
  features: string[];
  limits: {
    maxTextureDimension2D: number;
    maxBufferSize: number;
    maxStorageBufferBindingSize: number;
  };
}

interface BenchmarkResult {
  adapter: AdapterEvidence;
  browser: string;
  sourceMode: "synthetic-canvas-imagebitmap";
  fps: number;
  frames: number;
  input: "1920x1080";
  output: "3840x2160";
  quality: QualityLevel;
  passCount: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  processingSamplesMs: number[];
  mainThreadP50Ms: number;
  mainThreadP95Ms: number;
  mainThreadP99Ms: number;
  mainThreadSamplesMs: number[];
  presented: number;
  missedSourceFrames: number;
  skippedFrames: number;
  staleFrames: number;
  bypassCount: number;
  failedFrames: number;
  gpuErrors: string[];
  timestamp: string;
}

declare global {
  interface Window {
    __P1_BENCHMARK__?: BenchmarkResult | undefined;
    __P1_BENCHMARK_ERROR__?: string | undefined;
    __P1_CLEANUP__?: (() => void) | undefined;
  }
}

const sourceCanvas = required<HTMLCanvasElement>("source-canvas");
const output = required<HTMLCanvasElement>("output");
const stage = required<HTMLElement>("stage");
const split = required<HTMLInputElement>("split");
const runButton = required<HTMLButtonElement>("run");
const qualitySelect = required<HTMLSelectElement>("quality");
const fpsSelect = required<HTMLSelectElement>("fps");
const framesSelect = required<HTMLSelectElement>("frames");

let animationId = 0;
let activeCleanup: (() => void) | undefined;

split.addEventListener("input", updateSplit);
runButton.addEventListener("click", () => void runSelectedBenchmark());
updateSplit();
startDrawing();

async function runSelectedBenchmark(): Promise<void> {
  runButton.disabled = true;
  window.__P1_BENCHMARK__ = undefined;
  window.__P1_BENCHMARK_ERROR__ = undefined;
  delete document.documentElement.dataset.benchmark;
  setText("status", "hazırlanıyor");

  try {
    const quality = qualitySelect.value as QualityLevel;
    const fps = Number(fpsSelect.value);
    const frameCount = Number(framesSelect.value);
    const result = await benchmark(quality, fps, frameCount);
    window.__P1_BENCHMARK__ = result;
    setText("status", "tamamlandı");
    setText("p50", `${result.p50Ms.toFixed(2)} ms`);
    setText("p95", `${result.p95Ms.toFixed(2)} ms`);
    setText("p99", `${result.p99Ms.toFixed(2)} ms`);
    setText("presented", String(result.presented));
    setText("missed", String(result.missedSourceFrames));
    setText("skipped", String(result.skippedFrames));
    setText("stale", String(result.staleFrames));
    setText("bypass", String(result.bypassCount));
    document.documentElement.dataset.benchmark = "complete";
  } catch (error) {
    const message = formatBenchmarkError(error);
    window.__P1_BENCHMARK_ERROR__ = message;
    setText("status", `hata: ${message}`);
    document.documentElement.dataset.benchmark = "error";
  } finally {
    runButton.disabled = false;
  }
}

function formatBenchmarkError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? `; cause=${error.cause.message}` : "";
  return `${error.name}: ${error.message}${cause}`;
}

async function benchmark(
  quality: QualityLevel,
  fps: number,
  frameCount: number,
): Promise<BenchmarkResult> {
  if (!navigator.gpu) throw new Error("WebGPU kullanılamıyor");
  activeCleanup?.();
  activeCleanup = undefined;

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("WebGPU adaptörü bulunamadı");
  const adapterEvidence = serializeAdapter(adapter);
  const device = await adapter.requestDevice();
  const gpuErrors: string[] = [];
  device.addEventListener("uncapturederror", (event) => {
    gpuErrors.push(event.error.message);
  });
  const canvasContext = output.getContext("webgpu") as GPUCanvasContext | null;
  if (!canvasContext) throw new Error("WebGPU canvas context oluşturulamadı");
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  const backend = new Anime4kBackend();

  await backend.initialize({
    device,
    canvasContext,
    presentationFormat,
    initialInput: { width: 1920, height: 1080 },
    initialOutput: { width: 3840, height: 2160 },
    profile: "anime",
    qualityLevel: quality,
  });

  const metrics = new RollingFrameMetrics();
  const source = new SyntheticVideoFrameSource(fps, sourceCanvas.width, sourceCanvas.height);
  const processingSamplesMs: number[] = [];
  const mainThreadSamplesMs: number[] = [];
  const passCount = quality === "low" ? 1 : 2;

  try {
    // Warm up shader compilation, texture import and the presentation path.
    for (let index = 0; index < 12; index += 1) {
      await source.waitForNextFrame();
      const warmup = await prepareCanvasFrame(backend);
      warmup.present();
    }

    await runScheduledFrames(
      source,
      backend,
      metrics,
      frameCount,
      processingSamplesMs,
      mainThreadSamplesMs,
      (presented) => {
        if (presented % 10 === 0) setText("status", `${presented}/${frameCount}`);
      },
    );
    await device.queue.onSubmittedWorkDone();
  } catch (error) {
    backend.dispose();
    throw error;
  }

  activeCleanup = () => {
    backend.dispose();
    activeCleanup = undefined;
    window.__P1_CLEANUP__ = undefined;
  };
  window.__P1_CLEANUP__ = activeCleanup;

  const snapshot = metrics.snapshot();
  return {
    adapter: adapterEvidence,
    browser: navigator.userAgent,
    sourceMode: "synthetic-canvas-imagebitmap",
    fps,
    frames: frameCount,
    input: "1920x1080",
    output: "3840x2160",
    quality,
    passCount,
    p50Ms: summarizeTimingSamples(processingSamplesMs).p50,
    p95Ms: summarizeTimingSamples(processingSamplesMs).p95,
    p99Ms: summarizeTimingSamples(processingSamplesMs).p99,
    processingSamplesMs,
    mainThreadP50Ms: summarizeTimingSamples(mainThreadSamplesMs).p50,
    mainThreadP95Ms: summarizeTimingSamples(mainThreadSamplesMs).p95,
    mainThreadP99Ms: summarizeTimingSamples(mainThreadSamplesMs).p99,
    mainThreadSamplesMs,
    presented: snapshot.presentedFrames,
    missedSourceFrames: snapshot.missedFrames,
    skippedFrames: snapshot.droppedFrames,
    staleFrames: snapshot.staleFrames,
    // Fixed low/high runs do not request adaptive bypass. A non-zero value
    // is reserved for a separate adaptive-quality benchmark run.
    bypassCount: 0,
    failedFrames: snapshot.failedFrames,
    timestamp: new Date().toISOString(),
    gpuErrors,
  };
}

async function runScheduledFrames(
  source: SyntheticVideoFrameSource,
  backend: Anime4kBackend,
  metrics: RollingFrameMetrics,
  frameCount: number,
  processingSamplesMs: number[],
  mainThreadSamplesMs: number[],
  onPresented: (count: number) => void,
): Promise<void> {
  let resolveRun!: () => void;
  let rejectRun!: (error: unknown) => void;
  const completed = new Promise<void>((resolve, reject) => {
    resolveRun = resolve;
    rejectRun = reject;
  });
  const timeout = window.setTimeout(() => {
    scheduler.stop();
    rejectRun(new Error(`Benchmark ${frameCount} sunulan kareye zamanında ulaşmadı.`));
  }, 240_000);

  const scheduler = new FrameScheduler<SyntheticVideoFrameSource>({
    source,
    preparer: {
      prepare: async () => {
        const startedAt = performance.now();
        try {
          const prepared = await prepareCanvasFrame(backend);
          mainThreadSamplesMs.push(prepared.stats.cpuSubmitMs);
          return prepared;
        } finally {
          processingSamplesMs.push(performance.now() - startedAt);
        }
      },
    },
    metrics,
    onPresented: () => {
      const presented = metrics.snapshot().presentedFrames;
      onPresented(presented);
      if (presented >= frameCount) {
        scheduler.stop();
        window.clearTimeout(timeout);
        resolveRun();
      }
    },
    onError: (error) => {
      scheduler.stop();
      window.clearTimeout(timeout);
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

async function prepareCanvasFrame(
  backend: Anime4kBackend,
): Promise<Awaited<ReturnType<Anime4kBackend["prepare"]>>> {
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

function startDrawing(): void {
  const context = sourceCanvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("2D test canvas oluşturulamadı");
  const startedAt = performance.now();

  const draw = (now: number) => {
    const t = (now - startedAt) / 1000;
    drawArtifactFixture(context, t);
    animationId = requestAnimationFrame(draw);
  };
  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(draw);
}

function drawArtifactFixture(context: CanvasRenderingContext2D, time: number): void {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  context.fillStyle = "#ece7db";
  context.fillRect(0, 0, width, height);

  // Halo: high-contrast curved silhouette on a light flat field.
  context.fillStyle = "#172532";
  context.beginPath();
  context.arc(340, 290, 190, Math.PI * 0.15, Math.PI * 1.85);
  context.lineTo(340, 290);
  context.fill();
  context.strokeStyle = "#080b10";
  context.lineWidth = 12;
  context.stroke();

  // Double-line: slowly moving one-pixel and thick diagonal contours.
  const drift = (time * 18) % 80;
  context.strokeStyle = "#101820";
  for (let offset = -80; offset < 540; offset += 28) {
    context.lineWidth = offset % 56 === 0 ? 2 : 7;
    context.beginPath();
    context.moveTo(560 + offset + drift, 80);
    context.lineTo(960 + offset + drift, 500);
    context.stroke();
  }

  // Color-bleed: saturated areas sharing a hard neutral boundary.
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

  // Temporal shimmer: fine hair/grid lines moving by sub-pixel increments.
  context.fillStyle = "#20252f";
  context.fillRect(960, 540, 960, 540);
  context.save();
  context.translate((time * 11) % 12, 0);
  context.strokeStyle = "#f4e8c2";
  context.lineWidth = 2;
  for (let x = 960; x < 1940; x += 12) {
    context.beginPath();
    context.moveTo(x, 540);
    context.lineTo(x + 220, 1080);
    context.stroke();
  }
  context.restore();
}

function summarizeTimingSamples(values: readonly number[]): {
  p50: number;
  p95: number;
  p99: number;
} {
  if (values.length === 0) return { p50: 0, p95: 0, p99: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  return {
    p50: nearestRank(sorted, 0.5),
    p95: nearestRank(sorted, 0.95),
    p99: nearestRank(sorted, 0.99),
  };
}

function nearestRank(sorted: readonly number[], percentile: number): number {
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)] ?? 0;
}

function updateSplit(): void {
  const value = Number(split.value);
  stage.style.setProperty("--split", `${value}%`);
  stage.style.setProperty("--original-right", `${100 - value}%`);
  stage.style.setProperty("--enhanced-left", `${value}%`);
}

function setText(id: string, value: string): void {
  required<HTMLElement>(id).textContent = value;
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Eksik benchmark elementi: ${id}`);
  return element as T;
}
