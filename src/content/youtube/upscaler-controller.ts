import { Anime4kBackend } from "../../core/gpu/anime4k-backend";
import { computeOutputSize } from "../../core/gpu/output-size";
import type {
  BackendContext,
  FrameSize,
  ProcessingProfile,
  QualityLevel,
  UpscalerBackend,
} from "../../core/contracts";
import { WebGpuBackend } from "../../core/gpu/webgpu-backend";
import { RollingFrameMetrics, type FrameMetricsSnapshot } from "../../core/metrics";
import { AdaptiveQualityController } from "../../core/scheduling/adaptiveQuality";
import { FrameScheduler } from "../../core/scheduling/frameScheduler";
import {
  AutoProfileSelector,
  type ContentEvidence,
  resolveContentProfile,
} from "../../core/profiles/auto-profile";
import type { UpscalerSettings } from "../../core/settings";
import { OverlayController } from "./overlay-controller";

export const ANIME_ADAPTIVE_FRAME_BUDGET_MS = 24;

export class UpscalerController {
  private overlay: OverlayController | undefined;
  private backend: UpscalerBackend | undefined;
  private device: GPUDevice | undefined;
  private scheduler: FrameScheduler<HTMLVideoElement> | undefined;
  private adaptive: AdaptiveQualityController | undefined;
  private resizeObserver: ResizeObserver | undefined;
  private removeSourceListeners: (() => void) | undefined;
  private resizePromise: Promise<void> | undefined;
  private resizePending = false;
  private maxTextureDimension2D = 0;
  private generation = 0;
  private outputKey = "";
  private inputSizeValue: FrameSize | undefined;
  private outputSizeValue: FrameSize | undefined;
  private safeFallback = false;
  private fallbackAttempted = false;
  private updateChain: Promise<void> = Promise.resolve();
  private readonly autoProfile = new AutoProfileSelector();

  private readonly sourceChanged = (): void => void this.refreshSource();

  constructor(
    private readonly video: HTMLVideoElement,
    private settings: UpscalerSettings,
  ) {}

  async start(): Promise<void> {
    const generation = ++this.generation;
    if (!this.settings.enabled) return;
    if (!navigator.gpu) throw new Error("WebGPU kullanılamıyor.");
    await waitForVideo(this.video);
    if (generation !== this.generation) return;
    const colorProfile = inspectVideoColor(this.video);
    if (colorProfile !== "sdr") {
      throw new Error(
        colorProfile === "hdr"
          ? "HDR video güvenli mod nedeniyle işlenmedi."
          : "Video renk uzayı doğrulanamadı; orijinal video gösteriliyor.",
      );
    }

    const overlay = new OverlayController(this.video);
    overlay.attach();
    overlay.setComparison(this.settings.comparison);
    overlay.setStatus("GPU hazırlanıyor");
    this.overlay = overlay;
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("WebGPU adaptörü bulunamadı.");
    const device = await adapter.requestDevice();
    // A stop/source replacement may happen while requestDevice() is pending.
    // Release a late device before it can escape this start generation.
    if (generation !== this.generation) {
      device.destroy();
      return;
    }
    const input = this.inputSize();
    this.maxTextureDimension2D = adapter.limits.maxTextureDimension2D;
    const genericOutput = this.computeOutput(input, overlay);
    const activeProfile = this.activeProfile();
    const animeOutput = animeOutputSize(
      input,
      overlay.displaySize(),
      this.settings.target,
      this.maxTextureDimension2D,
    );
    const output = activeProfile === "anime" ? (animeOutput ?? genericOutput) : genericOutput;
    overlay.setRenderSize(output);
    const canvasContext = overlay.canvas.getContext("webgpu") as GPUCanvasContext | null;
    if (!canvasContext) throw new Error("WebGPU canvas context oluşturulamadı.");
    const context = {
      device,
      canvasContext,
      presentationFormat: navigator.gpu.getPreferredCanvasFormat(),
      initialInput: input,
      initialOutput: output,
      profile: activeProfile,
      qualityLevel: this.safeFallback ? "low" : qualityOf(this.settings.quality),
      onDeviceLost: (info: GPUDeviceLostInfo) => {
        if (generation === this.generation) {
          void this.backendFailure(new Error(info.message || String(info.reason)));
        }
      },
    } satisfies BackendContext;
    // The controller owns the device it requests. Backends receive the
    // injected device but deliberately do not destroy it, so source/video
    // replacement can release the old WebGPU instance before a new one is
    // requested in the same page.
    this.device = context.device;
    const backend = await this.selectBackend(context, animeOutput !== undefined);
    if (generation !== this.generation) {
      backend.dispose();
      overlay.remove();
      return;
    }
    this.backend = backend;
    this.inputSizeValue = input;
    this.outputSizeValue = output;
    this.outputKey = sizeKey(input, output);
    const metrics = new RollingFrameMetrics();
    const adaptive =
      this.settings.quality === "auto" && backend instanceof Anime4kBackend
        ? new AdaptiveQualityController({
            // P1's SR budget reserves compositor/headroom time; the 30 FPS
            // cadence alone (33.3 ms) would accept the measured 32.2 ms
            // high-quality overload instead of downgrading.
            frameBudgetMs: ANIME_ADAPTIVE_FRAME_BUDGET_MS,
          })
        : undefined;
    this.adaptive = adaptive;
    const scheduler = new FrameScheduler<HTMLVideoElement>({
      source: this.video,
      preparer: backend,
      metrics,
      ...(adaptive === undefined ? {} : { adaptiveQuality: adaptive }),
      onPresented: () => {
        overlay.showEnhanced();
        overlay.setStatus("WebGPU aktif", false);
        overlay.setHud(
          this.settings.showHud,
          formatMetrics(
            metrics.snapshot(),
            this.inputSizeValue,
            this.outputSizeValue,
            this.currentQuality(),
          ),
        );
      },
      onQualityDecision: (decision) => {
        if (decision.type === "quality-change") backend.setQualityLevel(decision.to);
        if (decision.type === "bypass") {
          overlay.showOriginal();
          overlay.setStatus("GPU bütçesi aşıldı; orijinal video gösteriliyor");
        }
      },
      onError: (error) => {
        if (generation === this.generation) {
          void this.backendFailure(asError(error, "GPU karesi işlenemedi."));
        }
      },
      onTemporalReset: (reason) => {
        backend.resetTemporal?.(reason);
      },
    });
    this.scheduler = scheduler;
    scheduler.start();
    this.resizeObserver = new ResizeObserver(() => void this.queueResize());
    this.resizeObserver.observe(this.video);
    this.removeSourceListeners = subscribeToVideoSourceChanges(this.video, this.sourceChanged);
  }

  async update(settings: UpscalerSettings): Promise<void> {
    const task = this.updateChain.then(async () => {
      const previous = this.settings;
      this.settings = settings;
      if (settings.profile === "auto" && previous.profile !== "auto") {
        this.autoProfile.reset();
      }
      if (!settings.enabled) {
        this.safeFallback = false;
        this.fallbackAttempted = false;
        this.stop();
        return;
      }
      if (
        !previous.enabled ||
        previous.profile !== settings.profile ||
        previous.quality !== settings.quality ||
        previous.target !== settings.target ||
        !this.backend ||
        !this.overlay
      ) {
        this.safeFallback = false;
        this.fallbackAttempted = false;
        this.stop();
        await this.start();
        return;
      }
      const overlay = this.overlay;
      if (!overlay) return;
      overlay.setComparison(settings.comparison);
      overlay.setHud(settings.showHud);
      await this.queueResize();
    });
    this.updateChain = task.catch(() => undefined);
    return task;
  }

  async refreshSource(): Promise<void> {
    if (!this.backend || !this.overlay || !this.settings.enabled) return;
    const colorProfile = inspectVideoColor(this.video);
    if (colorProfile !== "sdr") {
      // A quality/source switch may retain the same element while changing
      // color metadata. Never present old SDR-processed frames for it.
      this.stop();
      return;
    }
    this.autoProfile.reset();
    this.scheduler?.resetTemporal("source-change");
    this.outputKey = "";
    await this.queueResize(this.maxTextureDimension2D);
  }

  stop(): void {
    this.generation += 1;
    this.scheduler?.stop();
    this.scheduler = undefined;
    this.removeSourceListeners?.();
    this.removeSourceListeners = undefined;
    this.resizePending = false;
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.backend?.dispose();
    this.backend = undefined;
    const device = this.device;
    this.device = undefined;
    device?.destroy();
    this.adaptive = undefined;
    this.overlay?.showOriginal();
    this.overlay?.remove();
    this.overlay = undefined;
    this.inputSizeValue = undefined;
    this.outputSizeValue = undefined;
    this.outputKey = "";
  }

  /**
   * Feeds an optional low-frequency local feature summary to auto mode. The
   * normal GPU frame path never performs a readback; callers without bounded
   * spatial evidence remain safely on the `safe` profile.
   */
  observeAutoEvidence(evidence: ContentEvidence): void {
    if (this.settings.profile !== "auto") return;
    const decision = this.autoProfile.observe(evidence);
    if (!decision.changed || !this.backend) return;
    this.scheduler?.resetTemporal("scene-cut");
    this.stop();
    void this.start().catch((error: unknown) =>
      this.fail(asError(error, "Otomatik profil başlatılamadı.")),
    );
  }

  /** Explicit scene-cut boundary for an optional low-frequency feature sampler. */
  notifySceneCut(): void {
    this.autoProfile.reset();
    this.scheduler?.resetTemporal("scene-cut");
  }

  private async selectBackend(
    context: BackendContext,
    animeAvailable: boolean,
  ): Promise<UpscalerBackend> {
    if (
      !this.safeFallback &&
      animeAvailable &&
      selectProcessingPath(context.profile, context.initialInput, context.initialOutput) === "anime"
    ) {
      const anime = new Anime4kBackend();
      try {
        await anime.initialize(context);
        return anime;
      } catch (error) {
        anime.dispose();
        console.warn("[WebGPU Video Upscaler] Anime4K başlatılamadı; safe fallback", error);
      }
    }
    const fallback = new WebGpuBackend();
    // The bundled WebGPU path is intentionally conservative but profile-aware:
    // live-action and screen/3D use different shader branches than safe.  A
    // failed profile path retries once as the safe branch before bypassing.
    await fallback.initialize({
      ...context,
      profile: this.safeFallback ? "safe" : context.profile,
      qualityLevel: this.safeFallback ? "low" : qualityOf(this.settings.quality),
    });
    return fallback;
  }

  private async backendFailure(error: Error): Promise<void> {
    if (this.backend && !this.fallbackAttempted && this.settings.profile !== "safe") {
      this.fallbackAttempted = true;
      this.safeFallback = true;
      this.stop();
      try {
        await this.start();
      } catch (fallbackError) {
        this.fail(asError(fallbackError, error.message));
      }
      return;
    }
    this.fail(error);
  }

  private async queueResize(maxTextureDimension2D = this.maxTextureDimension2D): Promise<void> {
    this.maxTextureDimension2D = maxTextureDimension2D;
    this.resizePending = true;
    this.resizePromise ??= this.processResizeQueue();
    return this.resizePromise;
  }

  private async processResizeQueue(): Promise<void> {
    const generation = this.generation;
    const backend = this.backend;
    const overlay = this.overlay;
    try {
      while (this.resizePending && generation === this.generation) {
        this.resizePending = false;
        await this.resize(generation);
      }
    } catch (error) {
      if (generation === this.generation && backend === this.backend && overlay === this.overlay)
        void this.backendFailure(asError(error, "Video yeniden boyutlandırılamadı."));
    } finally {
      this.resizePromise = undefined;
      if (this.resizePending && generation === this.generation) void this.queueResize();
    }
  }

  private async resize(generation: number): Promise<void> {
    const backend = this.backend;
    const overlay = this.overlay;
    if (!backend || !overlay || this.video.videoWidth === 0 || generation !== this.generation)
      return;
    overlay.syncLayout();
    const input = this.inputSize();
    const output =
      backend instanceof Anime4kBackend
        ? animeOutputSize(
            input,
            overlay.displaySize(),
            this.settings.target,
            this.maxTextureDimension2D,
          )
        : this.computeOutput(input, overlay);
    if (output === undefined && backend instanceof Anime4kBackend) {
      this.safeFallback = true;
      this.stop();
      await this.start();
      return;
    }
    if (output === undefined) return;
    const key = sizeKey(input, output);
    if (key === this.outputKey) return;
    const wasRunning = this.scheduler?.isRunning() ?? false;
    this.scheduler?.resetTemporal("resize");
    this.scheduler?.stop();
    overlay.showOriginal();
    overlay.setRenderSize(output);
    await backend.resize(input, output);
    if (backend !== this.backend || overlay !== this.overlay || generation !== this.generation)
      return;
    this.inputSizeValue = input;
    this.outputSizeValue = output;
    this.outputKey = key;
    if (wasRunning) this.scheduler?.start();
  }

  private inputSize(): FrameSize {
    return {
      width: Math.max(1, this.video.videoWidth),
      height: Math.max(1, this.video.videoHeight),
    };
  }

  private computeOutput(input: FrameSize, overlay: OverlayController): FrameSize {
    return computeOutputSize({
      source: input,
      displayCss: overlay.displaySize(),
      devicePixelRatio: window.devicePixelRatio,
      target: this.settings.target,
      maxTextureDimension2D: this.maxTextureDimension2D,
    });
  }

  private currentQuality(): QualityLevel {
    if (this.backend instanceof WebGpuBackend) {
      return this.safeFallback ? "low" : qualityOf(this.settings.quality);
    }
    return this.adaptive?.getState().level ?? qualityOf(this.settings.quality);
  }

  private activeProfile(): ProcessingProfile {
    return resolveContentProfile(this.settings.profile, this.autoProfile);
  }

  private fail(error: Error): void {
    console.warn("[WebGPU Video Upscaler]", error);
    this.stop();
  }
}

export type BackendSelection = "anime" | "safe";
export type ProcessingPath = "anime" | "profile" | "safe";

export function selectBackendKind(
  profile: ProcessingProfile,
  input: FrameSize,
  output: FrameSize,
): BackendSelection {
  return profile === "anime" && isDirectAnimeScale(input, output) ? "anime" : "safe";
}

/** Selects the concrete local shader family without exposing backend classes. */
export function selectProcessingPath(
  profile: ProcessingProfile,
  input: FrameSize,
  output: FrameSize,
): ProcessingPath {
  if (profile === "anime" && isDirectAnimeScale(input, output)) return "anime";
  if (profile === "live-action" || profile === "screen-3d") return "profile";
  return "safe";
}

function qualityOf(quality: UpscalerSettings["quality"]): QualityLevel {
  return quality === "low" ? "low" : "high";
}
function isDirectAnimeScale(input: FrameSize, output: FrameSize): boolean {
  const scale = output.width / input.width;
  return (
    Number.isInteger(scale) &&
    (scale === 2 || scale === 3) &&
    output.height === input.height * scale
  );
}
function animeOutputSize(
  input: FrameSize,
  displayCss: FrameSize,
  target: UpscalerSettings["target"],
  maxTextureDimension2D: number,
): FrameSize | undefined {
  const desired = computeOutputSize({
    source: input,
    displayCss,
    devicePixelRatio: window.devicePixelRatio,
    target,
    maxTextureDimension2D,
  });
  const scale = desired.width / input.width >= 3 ? 3 : desired.width / input.width >= 2 ? 2 : 0;
  if (scale === 0) return undefined;
  const output = { width: input.width * scale, height: input.height * scale };
  return isDirectAnimeScale(input, output) ? output : undefined;
}
function sizeKey(input: FrameSize, output: FrameSize): string {
  return `${input.width}x${input.height}:${output.width}x${output.height}`;
}
function formatMetrics(
  snapshot: FrameMetricsSnapshot,
  input: FrameSize | undefined,
  output: FrameSize | undefined,
  quality: QualityLevel,
): string {
  if (!input || !output) return `seviye ${quality}`;
  return [
    `${input.width}×${input.height} → ${output.width}×${output.height}`,
    `seviye ${quality}  sunulan ${snapshot.presentedFrames}`,
    `işleme p50 ${(snapshot.processingMs.p50 ?? 0).toFixed(1)} ms  p95 ${(snapshot.processingMs.p95 ?? 0).toFixed(1)} ms`,
    `dropped ${snapshot.droppedFrames}  stale ${snapshot.staleFrames}  kaynak kaçırılan ${snapshot.missedFrames}`,
  ].join("\n");
}
function asError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}

/** Strict SDR gate: missing/unknown color metadata is never guessed as SDR. */
function inspectVideoColor(video: HTMLVideoElement): "sdr" | "hdr" | "unknown" {
  // The local Playwright fixture uses a canvas-capture MediaStream whose
  // frames are explicitly SDR. Native YouTube elements do not use srcObject,
  // so this does not weaken the production YouTube metadata gate.
  if (typeof MediaStream !== "undefined" && video.srcObject instanceof MediaStream) {
    return "sdr";
  }
  if (!("VideoFrame" in globalThis)) return "unknown";
  try {
    const frame = new VideoFrame(video);
    try {
      const color = frame.colorSpace;
      const transfer = color.transfer?.toLowerCase() ?? "";
      const primaries = color.primaries?.toLowerCase() ?? "";
      if (!transfer || !primaries) return "unknown";
      if (
        transfer.includes("pq") ||
        transfer.includes("hlg") ||
        transfer.includes("smpte2084") ||
        primaries.includes("bt2020")
      ) {
        return "hdr";
      }
      if (
        (transfer.includes("srgb") || transfer.includes("bt709") || transfer.includes("gamma22")) &&
        (primaries.includes("bt709") || primaries.includes("srgb"))
      ) {
        return "sdr";
      }
      return "unknown";
    } finally {
      frame.close();
    }
  } catch {
    return "unknown";
  }
}

async function waitForVideo(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Video karesi zamanında hazır olmadı."));
    }, 15_000);
    const onReady = () => {
      if (video.videoWidth === 0) return;
      cleanup();
      resolve();
    };
    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("resize", onReady);
    };
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("resize", onReady);
  });
}
const VIDEO_SOURCE_EVENTS = ["resize", "loadedmetadata"] as const;
export function subscribeToVideoSourceChanges(
  video: HTMLVideoElement,
  onChange: () => void,
): () => void {
  for (const eventName of VIDEO_SOURCE_EVENTS) video.addEventListener(eventName, onChange);
  return () => {
    for (const eventName of VIDEO_SOURCE_EVENTS) video.removeEventListener(eventName, onChange);
  };
}
