import type {
  BackendContext,
  FrameSize,
  PreparedFrame,
  QualityLevel,
  RenderSource,
  RenderStats,
  UpscalerBackend,
} from "../contracts";
import {
  ANIME_EDGE_AWARE_SHADER,
  ANIME_LINE_REFINEMENT_SHADER,
  ANIME_PRESENT_SHADER,
  ANIME_BLIT_SHADER,
} from "../models/anime4k-shaders";
import { ANIME_PROFILE_LEVELS, getAnimePassCount } from "../profiles/anime-profile";
import { TEMPORAL_STABILIZATION } from "./webgpu-backend";

// WebGPU usage flags are fixed by the specification. Keeping the minimal flags
// local avoids relying on browser globals during Node-based contract tests.
const BUFFER_USAGE_COPY_DST = 0x0008;
const BUFFER_USAGE_MAP_READ = 0x0001;
const BUFFER_USAGE_UNIFORM = 0x0040;
const TEXTURE_USAGE_COPY_DST = 0x02;
const TEXTURE_USAGE_BINDING = 0x04;
const TEXTURE_USAGE_RENDER_ATTACHMENT = 0x10;
const TEXTURE_USAGE_COPY_SRC = 0x01;

export type Anime4kBackendErrorCode =
  | "already-initialized"
  | "not-initialized"
  | "disposed"
  | "device-lost"
  | "invalid-size"
  | "invalid-scale"
  | "source-size-mismatch"
  | "busy"
  | "frame-consumed"
  | "stale-frame"
  | "gpu-failure";

export class Anime4kBackendError extends Error {
  constructor(
    readonly code: Anime4kBackendErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "Anime4kBackendError";
  }
}

/**
 * Anime4K-compatible, fidelity-first direct x2/x3 WebGPU backend.
 *
 * Source upload uses `copyExternalImageToTexture` into a persistent texture.
 * This is the WebGPU external-image path: it performs no CPU readback and does
 * not allocate textures or buffers per frame. All processing is offscreen;
 * only a scheduler-approved PreparedFrame can touch the canvas swapchain.
 */
export class Anime4kBackend implements UpscalerBackend {
  private device: GPUDevice | undefined;
  private canvasContext: GPUCanvasContext | undefined;
  private onDeviceLost: BackendContext["onDeviceLost"];
  private sampler: GPUSampler | undefined;
  private paramsBuffer: GPUBuffer | undefined;
  private edgePipeline: GPURenderPipeline | undefined;
  private refinementPipeline: GPURenderPipeline | undefined;
  private presentPipeline: GPURenderPipeline | undefined;
  private temporalPipeline: GPURenderPipeline | undefined;
  private sourceTexture: GPUTexture | undefined;
  private intermediateTexture: GPUTexture | undefined;
  private finalTexture: GPUTexture | undefined;
  private intermediateView: GPUTextureView | undefined;
  private finalView: GPUTextureView | undefined;
  private sourceBindGroup: GPUBindGroup | undefined;
  private refinementBindGroup: GPUBindGroup | undefined;
  private presentBindGroup: GPUBindGroup | undefined;
  private temporalBindGroup: GPUBindGroup | undefined;
  private temporalOutputTexture: GPUTexture | undefined;
  private temporalBuffer: GPUBuffer | undefined;
  private historyTexture: GPUTexture | undefined;
  private historyValid = false;
  private temporalEnabled = false;
  private inputSize: FrameSize = { width: 0, height: 0 };
  private outputSize: FrameSize = { width: 0, height: 0 };
  private qualityLevel: QualityLevel = "low";
  private initialized = false;
  private disposed = false;
  private deviceLost = false;
  private preparing = false;
  private resourceGeneration = 0;
  private nextFrameToken = 0;
  private activeFrameToken: number | undefined;
  private deviceLostListenerGeneration = 0;
  private strengthMultiplier = 1.0;
  /** Harness-only override; production keeps TEMPORAL_STABILIZATION defaults. */
  private diagnosticTemporalBlend: number | undefined;
  private diagnosticTemporalGate: number | undefined;

  async initialize(context: BackendContext): Promise<void> {
    if (this.initialized) {
      throw new Anime4kBackendError("already-initialized", "Anime4K backend zaten başlatıldı.");
    }
    if (this.disposed) this.disposed = false;

    validateAnimeScale(context.initialInput, context.initialOutput);
    this.deviceLost = false;
    this.device = context.device;
    this.canvasContext = context.canvasContext;
    this.onDeviceLost = context.onDeviceLost;
    this.qualityLevel = context.qualityLevel ?? "low";

    const device = context.device;
    this.sampler = device.createSampler({
      label: "Anime4K linear clamp sampler",
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
    this.paramsBuffer = device.createBuffer({
      label: "Anime4K parameters",
      size: 32,
      usage: BUFFER_USAGE_UNIFORM | BUFFER_USAGE_COPY_DST,
    });
    this.temporalBuffer = device.createBuffer({
      label: "Anime4K temporal parameters",
      size: 16,
      usage: BUFFER_USAGE_UNIFORM | BUFFER_USAGE_COPY_DST,
    });

    this.edgePipeline = createPipeline(
      device,
      "Anime4K direct edge-aware scaler",
      ANIME_EDGE_AWARE_SHADER,
      "edgeAwareMain",
      "rgba8unorm",
    );
    this.refinementPipeline = createPipeline(
      device,
      "Anime4K bounded line refinement",
      ANIME_LINE_REFINEMENT_SHADER,
      "lineRefinementMain",
      "rgba8unorm",
    );
    this.temporalPipeline = createPipeline(
      device,
      "Anime4K temporal stabilization",
      ANIME_PRESENT_SHADER,
      "presentMain",
      "rgba8unorm",
    );
    this.presentPipeline = createPipeline(
      device,
      "Anime4K prepared-frame presentation",
      ANIME_BLIT_SHADER,
      "presentMain",
      context.presentationFormat,
    );

    context.canvasContext.configure({
      device,
      format: context.presentationFormat,
      alphaMode: "opaque",
      colorSpace: "srgb",
    });

    this.initialized = true;
    const listenerGeneration = ++this.deviceLostListenerGeneration;
    device.lost.then((info) => {
      // A device promise may settle after this backend has been disposed and
      // reinitialized. Only the listener belonging to the current session may
      // invalidate the new resources or notify the owner.
      if (this.disposed || listenerGeneration !== this.deviceLostListenerGeneration) return;
      this.deviceLost = true;
      this.historyValid = false;
      this.activeFrameToken = undefined;
      this.onDeviceLost?.(info);
    });

    await this.resize(context.initialInput, context.initialOutput);
  }

  async resize(input: FrameSize, output: FrameSize): Promise<void> {
    this.requireUsable();
    validateAnimeScale(input, output);
    const device = this.requireDevice();

    try {
      await device.queue.onSubmittedWorkDone();
    } catch (error) {
      throw this.gpuFailure("GPU resize öncesinde tamamlanamadı.", error);
    }
    this.requireUsable();

    this.resourceGeneration += 1;
    this.activeFrameToken = undefined;
    this.destroySizeDependentResources();
    this.inputSize = { ...input };
    this.outputSize = { ...output };

    this.sourceTexture = device.createTexture({
      label: "Anime4K persistent video source",
      size: [input.width, input.height],
      format: "rgba8unorm",
      // Dawn/Chrome requires COPY_DST sources used by
      // copyExternalImageToTexture to also declare RenderAttachment usage.
      usage:
        TEXTURE_USAGE_COPY_DST |
        TEXTURE_USAGE_BINDING |
        TEXTURE_USAGE_RENDER_ATTACHMENT |
        TEXTURE_USAGE_COPY_SRC,
    });
    this.intermediateTexture = device.createTexture({
      label: "Anime4K high-quality intermediate",
      size: [output.width, output.height],
      format: "rgba8unorm",
      usage: TEXTURE_USAGE_RENDER_ATTACHMENT | TEXTURE_USAGE_BINDING | TEXTURE_USAGE_COPY_SRC,
    });
    this.finalTexture = device.createTexture({
      label: "Anime4K prepared final frame",
      size: [output.width, output.height],
      format: "rgba8unorm",
      usage: TEXTURE_USAGE_RENDER_ATTACHMENT | TEXTURE_USAGE_BINDING | TEXTURE_USAGE_COPY_SRC,
    });
    this.historyTexture = device.createTexture({
      label: "Anime4K temporal history",
      size: [output.width, output.height],
      format: "rgba8unorm",
      usage: TEXTURE_USAGE_BINDING | TEXTURE_USAGE_COPY_DST,
    });
    this.temporalOutputTexture = device.createTexture({
      label: "Anime4K temporal output",
      size: [output.width, output.height],
      format: "rgba8unorm",
      usage: TEXTURE_USAGE_RENDER_ATTACHMENT | TEXTURE_USAGE_BINDING | TEXTURE_USAGE_COPY_SRC,
    });
    this.intermediateView = this.intermediateTexture.createView();
    this.finalView = this.finalTexture.createView();

    this.sourceBindGroup = device.createBindGroup({
      label: "Anime4K persistent source bindings",
      layout: this.requireEdgePipeline().getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sourceTexture.createView() },
        { binding: 1, resource: this.requireSampler() },
        { binding: 2, resource: { buffer: this.requireParamsBuffer() } },
      ],
    });
    this.refinementBindGroup = device.createBindGroup({
      label: "Anime4K refinement bindings",
      layout: this.requireRefinementPipeline().getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.intermediateTexture.createView() },
        { binding: 1, resource: this.requireSampler() },
        { binding: 2, resource: { buffer: this.requireParamsBuffer() } },
      ],
    });
    this.temporalBindGroup = device.createBindGroup({
      label: "Anime4K presentation bindings",
      layout: this.requireTemporalPipeline().getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.finalTexture.createView() },
        { binding: 1, resource: this.requireHistoryTexture().createView() },
        { binding: 2, resource: this.requireSampler() },
        { binding: 3, resource: { buffer: this.requireTemporalBuffer() } },
      ],
    });
    this.presentBindGroup = device.createBindGroup({
      label: "Anime4K canvas blit bindings",
      layout: this.requirePresentPipeline().getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.temporalOutputTexture.createView() },
        { binding: 1, resource: this.requireSampler() },
      ],
    });
    this.writeTemporalParameters();
    this.writeParameters();
  }

  setQualityLevel(level: QualityLevel): void {
    this.requireUsable();
    this.qualityLevel = level;
    this.resetTemporal("quality-change");
    this.writeParameters();
  }

  setStrength(strength: number): void {
    this.requireUsable();
    this.strengthMultiplier = Math.max(0, Math.min(100, strength)) / 50;
    this.writeParameters();
  }

  resetTemporal(reason?: string): void {
    void reason;
    this.historyValid = false;
    this.writeTemporalParameters();
  }

  /** P4 evidence and future policy layers may disable history without changing the spatial path. */
  setTemporalEnabled(enabled: boolean): void {
    this.requireUsable();
    this.temporalEnabled = enabled;
    this.historyValid = false;
    this.writeTemporalParameters();
  }

  /**
   * Deterministic P4 sweep hook. It is intentionally explicit and bounded so
   * diagnostics cannot silently change production policy/constants.
   */
  setTemporalParametersForDiagnostics(blend: number, gate: number): void {
    this.requireUsable();
    if (!Number.isFinite(blend) || blend < 0 || blend > TEMPORAL_STABILIZATION.maxBlend) {
      throw new Anime4kBackendError("invalid-scale", "Temporal diagnostic blend sınır dışında.");
    }
    if (!Number.isFinite(gate) || gate < 0 || gate > 1) {
      throw new Anime4kBackendError("invalid-scale", "Temporal diagnostic gate sınır dışında.");
    }
    this.diagnosticTemporalBlend = blend;
    this.diagnosticTemporalGate = gate;
    this.resetTemporal("diagnostic-parameter-change");
  }

  /** Harness-only stage readbacks; production paths never call these debug hooks. */
  async debugReadbackSourceTexture(): Promise<{
    width: number;
    height: number;
    pixels: Uint8Array;
  }> {
    return this.debugReadbackTexture(this.requireSourceTexture(), this.inputSize, "source");
  }

  async debugReadbackFinalTexture(): Promise<{
    width: number;
    height: number;
    pixels: Uint8Array;
  }> {
    return this.debugReadbackTexture(this.requireFinalTexture(), this.outputSize, "spatial-final");
  }

  async debugReadbackTemporalOutput(): Promise<{
    width: number;
    height: number;
    pixels: Uint8Array;
  }> {
    return this.debugReadbackTexture(
      this.requireTemporalOutputTexture(),
      this.outputSize,
      "temporal-output",
    );
  }

  private async debugReadbackTexture(
    texture: GPUTexture,
    size: { width: number; height: number },
    label: string,
  ): Promise<{
    width: number;
    height: number;
    pixels: Uint8Array;
  }> {
    this.requireUsable();
    const device = this.requireDevice();
    const bytesPerRow = Math.ceil((size.width * 4) / 256) * 256;
    const buffer = device.createBuffer({
      label: `P4 debug ${label} readback`,
      size: bytesPerRow * size.height,
      usage: BUFFER_USAGE_COPY_DST | BUFFER_USAGE_MAP_READ,
    });
    try {
      const encoder = device.createCommandEncoder({ label: "P4 debug texture readback" });
      encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow, rowsPerImage: size.height }, [
        size.width,
        size.height,
        1,
      ]);
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
      await buffer.mapAsync(0x0001);
      const mapped = new Uint8Array(buffer.getMappedRange());
      const pixels = new Uint8Array(size.width * size.height * 4);
      for (let row = 0; row < size.height; row += 1) {
        pixels.set(
          mapped.subarray(row * bytesPerRow, row * bytesPerRow + size.width * 4),
          row * size.width * 4,
        );
      }
      buffer.unmap();
      return { width: size.width, height: size.height, pixels };
    } finally {
      buffer.destroy();
    }
  }

  async prepare(source: RenderSource): Promise<PreparedFrame> {
    this.requireUsable();
    if (this.preparing || this.activeFrameToken !== undefined) {
      throw new Anime4kBackendError(
        "busy",
        "Önceki Anime4K karesi sunulmadan veya atılmadan yenisi hazırlanamaz.",
      );
    }
    assertSourceSize(source, this.inputSize);

    const device = this.requireDevice();
    const startedAt = performance.now();
    const generation = this.resourceGeneration;
    const frameToken = ++this.nextFrameToken;
    const qualityLevel = this.qualityLevel;
    const passCount = getAnimePassCount(qualityLevel);
    this.preparing = true;

    try {
      device.queue.copyExternalImageToTexture(
        { source },
        {
          texture: this.requireSourceTexture(),
          colorSpace: "srgb",
          premultipliedAlpha: false,
        },
        [this.inputSize.width, this.inputSize.height],
      );

      const encoder = device.createCommandEncoder({
        label: `Anime4K ${qualityLevel} frame preparation`,
      });
      if (qualityLevel === "low") {
        encodePass(
          encoder,
          "Anime4K low direct edge-aware upscale",
          this.requireFinalView(),
          this.requireEdgePipeline(),
          this.requireSourceBindGroup(),
        );
      } else {
        encodePass(
          encoder,
          "Anime4K high direct edge-aware upscale",
          this.requireIntermediateView(),
          this.requireEdgePipeline(),
          this.requireSourceBindGroup(),
        );
        encodePass(
          encoder,
          "Anime4K high bounded line restoration",
          this.requireFinalView(),
          this.requireRefinementPipeline(),
          this.requireRefinementBindGroup(),
        );
      }
      device.queue.submit([encoder.finish()]);
      const cpuSubmitMs = performance.now() - startedAt;
      await device.queue.onSubmittedWorkDone();
      this.requireUsable();
      if (generation !== this.resourceGeneration) {
        throw new Anime4kBackendError(
          "stale-frame",
          "Resize sırasında hazırlanan Anime4K karesi geçersiz kaldı.",
        );
      }

      this.activeFrameToken = frameToken;
      const stats: RenderStats = {
        qualityLevel,
        cpuSubmitMs,
        gpuTimeMs: null,
        inputSize: { ...this.inputSize },
        outputSize: { ...this.outputSize },
        passCount,
      };
      return this.createPreparedFrame(frameToken, generation, stats);
    } catch (error) {
      if (error instanceof Anime4kBackendError) throw error;
      throw this.gpuFailure("Anime4K karesi hazırlanamadı.", error);
    } finally {
      this.preparing = false;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.initialized = false;
    this.resourceGeneration += 1;
    this.activeFrameToken = undefined;
    this.destroySizeDependentResources();
    this.paramsBuffer?.destroy();
    this.paramsBuffer = undefined;
    this.temporalBuffer?.destroy();
    this.temporalBuffer = undefined;
    this.sampler = undefined;
    this.edgePipeline = undefined;
    this.refinementPipeline = undefined;
    this.presentPipeline = undefined;
    this.temporalPipeline = undefined;
    this.canvasContext = undefined;
    this.deviceLostListenerGeneration += 1;
    // The device is injected and may be shared by other backends; do not destroy it.
    this.device = undefined;
  }

  private createPreparedFrame(
    frameToken: number,
    generation: number,
    stats: RenderStats,
  ): PreparedFrame {
    let consumed = false;
    const consume = (): void => {
      if (consumed) {
        throw new Anime4kBackendError(
          "frame-consumed",
          "Hazırlanan Anime4K karesi zaten sunuldu veya atıldı.",
        );
      }
      consumed = true;
      if (this.activeFrameToken === frameToken) this.activeFrameToken = undefined;
    };

    return {
      stats,
      present: () => {
        consume();
        this.requireUsable();
        if (generation !== this.resourceGeneration) {
          throw new Anime4kBackendError("stale-frame", "Eski boyuta ait Anime4K karesi sunulmadı.");
        }
        const device = this.requireDevice();
        const encoder = device.createCommandEncoder({
          label: "Present current Anime4K frame",
        });
        encodePass(
          encoder,
          "Anime4K temporal stabilization pass",
          this.requireTemporalOutputTexture().createView(),
          this.requireTemporalPipeline(),
          this.requireTemporalBindGroup(),
        );
        encodePass(
          encoder,
          "Anime4K scheduler-approved presentation",
          this.requireCanvasContext().getCurrentTexture().createView(),
          this.requirePresentPipeline(),
          this.requirePresentBindGroup(),
        );
        encoder.copyTextureToTexture(
          { texture: this.requireTemporalOutputTexture() },
          { texture: this.requireHistoryTexture() },
          [this.outputSize.width, this.outputSize.height, 1],
        );
        device.queue.submit([encoder.finish()]);
        this.historyValid = this.temporalEnabled;
        this.writeTemporalParameters();
      },
      discard: () => {
        consume();
      },
    };
  }

  private writeParameters(): void {
    const device = this.requireDevice();
    const profile = ANIME_PROFILE_LEVELS[this.qualityLevel];
    device.queue.writeBuffer(
      this.requireParamsBuffer(),
      0,
      new Float32Array([
        1 / this.inputSize.width,
        1 / this.inputSize.height,
        1 / this.outputSize.width,
        1 / this.outputSize.height,
        profile.edgeStrength * this.strengthMultiplier,
        profile.lineStrength * this.strengthMultiplier,
        0,
        0,
      ]),
    );
  }

  private writeTemporalParameters(): void {
    if (!this.device || !this.temporalBuffer) return;
    this.device.queue.writeBuffer(
      this.temporalBuffer,
      0,
      new Float32Array([
        this.diagnosticTemporalBlend ?? TEMPORAL_STABILIZATION.blend,
        this.diagnosticTemporalGate ?? TEMPORAL_STABILIZATION.gate,
        this.temporalEnabled && this.historyValid ? 1 : 0,
        0,
      ]),
    );
  }

  private destroySizeDependentResources(): void {
    this.historyValid = false;
    this.sourceTexture?.destroy();
    this.intermediateTexture?.destroy();
    this.finalTexture?.destroy();
    this.temporalOutputTexture?.destroy();
    this.historyTexture?.destroy();
    this.sourceTexture = undefined;
    this.intermediateTexture = undefined;
    this.finalTexture = undefined;
    this.temporalOutputTexture = undefined;
    this.historyTexture = undefined;
    this.intermediateView = undefined;
    this.finalView = undefined;
    this.sourceBindGroup = undefined;
    this.refinementBindGroup = undefined;
    this.presentBindGroup = undefined;
    this.temporalBindGroup = undefined;
  }

  private gpuFailure(message: string, cause: unknown): Anime4kBackendError {
    if (this.deviceLost) {
      return new Anime4kBackendError("device-lost", message, { cause });
    }
    return new Anime4kBackendError("gpu-failure", message, { cause });
  }

  private requireUsable(): void {
    if (this.disposed) {
      throw new Anime4kBackendError("disposed", "Anime4K backend dispose edildi.");
    }
    if (!this.initialized) {
      throw new Anime4kBackendError("not-initialized", "Anime4K backend başlatılmadı.");
    }
    if (this.deviceLost) {
      throw new Anime4kBackendError(
        "device-lost",
        "WebGPU cihazı kaybedildi; orijinal videoya dönülmeli.",
      );
    }
  }

  private requireDevice(): GPUDevice {
    if (!this.device) {
      throw new Anime4kBackendError("not-initialized", "WebGPU cihazı hazır değil.");
    }
    return this.device;
  }

  private requireCanvasContext(): GPUCanvasContext {
    if (!this.canvasContext) {
      throw new Anime4kBackendError("not-initialized", "WebGPU canvas hazır değil.");
    }
    return this.canvasContext;
  }

  private requireSampler(): GPUSampler {
    if (!this.sampler) throw new Anime4kBackendError("not-initialized", "Sampler hazır değil.");
    return this.sampler;
  }

  private requireParamsBuffer(): GPUBuffer {
    if (!this.paramsBuffer)
      throw new Anime4kBackendError("not-initialized", "Parametre buffer'ı hazır değil.");
    return this.paramsBuffer;
  }

  private requireTemporalBuffer(): GPUBuffer {
    if (!this.temporalBuffer)
      throw new Anime4kBackendError("not-initialized", "Temporal buffer hazır değil.");
    return this.temporalBuffer;
  }

  private requireHistoryTexture(): GPUTexture {
    if (!this.historyTexture)
      throw new Anime4kBackendError("not-initialized", "Temporal history hazır değil.");
    return this.historyTexture;
  }

  private requireEdgePipeline(): GPURenderPipeline {
    if (!this.edgePipeline)
      throw new Anime4kBackendError("not-initialized", "Edge pipeline hazır değil.");
    return this.edgePipeline;
  }

  private requireRefinementPipeline(): GPURenderPipeline {
    if (!this.refinementPipeline)
      throw new Anime4kBackendError("not-initialized", "Refinement pipeline hazır değil.");
    return this.refinementPipeline;
  }

  private requirePresentPipeline(): GPURenderPipeline {
    if (!this.presentPipeline)
      throw new Anime4kBackendError("not-initialized", "Present pipeline hazır değil.");
    return this.presentPipeline;
  }

  private requireTemporalPipeline(): GPURenderPipeline {
    if (!this.temporalPipeline)
      throw new Anime4kBackendError("not-initialized", "Temporal pipeline hazır değil.");
    return this.temporalPipeline;
  }

  private requireSourceTexture(): GPUTexture {
    if (!this.sourceTexture)
      throw new Anime4kBackendError("not-initialized", "Kaynak texture hazır değil.");
    return this.sourceTexture;
  }

  private requireIntermediateView(): GPUTextureView {
    if (!this.intermediateView) {
      throw new Anime4kBackendError("not-initialized", "Ara texture görünümü hazır değil.");
    }
    return this.intermediateView;
  }

  private requireFinalView(): GPUTextureView {
    if (!this.finalView) {
      throw new Anime4kBackendError("not-initialized", "Final texture görünümü hazır değil.");
    }
    return this.finalView;
  }

  private requireFinalTexture(): GPUTexture {
    if (!this.finalTexture)
      throw new Anime4kBackendError("not-initialized", "Final texture hazır değil.");
    return this.finalTexture;
  }

  private requireSourceBindGroup(): GPUBindGroup {
    if (!this.sourceBindGroup)
      throw new Anime4kBackendError("not-initialized", "Kaynak bind group hazır değil.");
    return this.sourceBindGroup;
  }

  private requireRefinementBindGroup(): GPUBindGroup {
    if (!this.refinementBindGroup)
      throw new Anime4kBackendError("not-initialized", "Refinement bind group hazır değil.");
    return this.refinementBindGroup;
  }

  private requirePresentBindGroup(): GPUBindGroup {
    if (!this.presentBindGroup)
      throw new Anime4kBackendError("not-initialized", "Present bind group hazır değil.");
    return this.presentBindGroup;
  }

  private requireTemporalBindGroup(): GPUBindGroup {
    if (!this.temporalBindGroup)
      throw new Anime4kBackendError("not-initialized", "Temporal bind group hazır değil.");
    return this.temporalBindGroup;
  }

  private requireTemporalOutputTexture(): GPUTexture {
    if (!this.temporalOutputTexture)
      throw new Anime4kBackendError("not-initialized", "Temporal output texture hazır değil.");
    return this.temporalOutputTexture;
  }
}

export function validateDirect2x(input: FrameSize, output: FrameSize): void {
  validateSize(input, "Girdi");
  validateSize(output, "Çıktı");
  if (output.width !== input.width * 2 || output.height !== input.height * 2) {
    throw new Anime4kBackendError(
      "invalid-scale",
      `Anime MVP yalnızca doğrudan x2 destekler: ${input.width}×${input.height} -> ${output.width}×${output.height}.`,
    );
  }
}

/**
 * Anime's direct paths intentionally avoid arbitrary resampling ratios. The
 * 1080p route is x2 and the 720p-to-4K route is x3; both are represented by
 * the same direct shader path and never use an x4-then-downsample detour.
 */
export function validateAnimeScale(input: FrameSize, output: FrameSize): void {
  validateSize(input, "Girdi");
  validateSize(output, "Çıktı");
  const scale = output.width / input.width;
  if (
    !Number.isInteger(scale) ||
    (scale !== 2 && scale !== 3) ||
    output.height !== input.height * scale
  ) {
    throw new Anime4kBackendError(
      "invalid-scale",
      `Anime yolu yalnızca doğrudan 2× veya 3× destekler: ${input.width}×${input.height} -> ${output.width}×${output.height}.`,
    );
  }
}

function validateSize(size: FrameSize, label: string): void {
  if (
    !Number.isInteger(size.width) ||
    !Number.isInteger(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    throw new Anime4kBackendError("invalid-size", `${label} boyutu pozitif tam sayı olmalıdır.`);
  }
}

function assertSourceSize(source: RenderSource, expected: FrameSize): void {
  const actual = readSourceSize(source);
  if (!actual) return;
  if (actual.width !== expected.width || actual.height !== expected.height) {
    throw new Anime4kBackendError(
      "source-size-mismatch",
      `Kaynak boyutu resize gerektiriyor: ${actual.width}×${actual.height}, beklenen ${expected.width}×${expected.height}.`,
    );
  }
}

function readSourceSize(source: RenderSource): FrameSize | undefined {
  const candidate = source as RenderSource & {
    videoWidth?: number;
    videoHeight?: number;
    displayWidth?: number;
    displayHeight?: number;
    width?: number;
    height?: number;
  };
  const width = candidate.videoWidth ?? candidate.displayWidth ?? candidate.width;
  const height = candidate.videoHeight ?? candidate.displayHeight ?? candidate.height;
  if (typeof width !== "number" || typeof height !== "number") return undefined;
  return { width, height };
}

function createPipeline(
  device: GPUDevice,
  label: string,
  shader: string,
  fragmentEntryPoint: string,
  format: GPUTextureFormat,
): GPURenderPipeline {
  const module = device.createShaderModule({ label, code: shader });
  return device.createRenderPipeline({
    label,
    layout: "auto",
    vertex: { module, entryPoint: "vertexMain" },
    fragment: {
      module,
      entryPoint: fragmentEntryPoint,
      targets: [{ format }],
    },
    primitive: { topology: "triangle-list" },
  });
}

function encodePass(
  encoder: GPUCommandEncoder,
  label: string,
  target: GPUTextureView,
  pipeline: GPURenderPipeline,
  bindGroup: GPUBindGroup,
): void {
  const pass = encoder.beginRenderPass({
    label,
    colorAttachments: [
      {
        view: target,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3);
  pass.end();
}
