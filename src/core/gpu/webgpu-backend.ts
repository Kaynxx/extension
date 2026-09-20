import { PRESENT_SHADER, PROCESS_SHADER } from "./shaders";
import type {
  BackendContext,
  FrameSize,
  PreparedFrame,
  ProcessingProfile,
  QualityLevel,
  RenderSource,
  RenderStats,
  UpscalerBackend,
} from "../contracts";

const BUFFER_UNIFORM = 0x0040;
const BUFFER_COPY_DST = 0x0008;
const TEXTURE_COPY_SRC = 0x0001;
const TEXTURE_COPY_DST = 0x0002;
const TEXTURE_BINDING = 0x0004;
const TEXTURE_RENDER_ATTACHMENT = 0x0010;

const PROFILE_IDS: Record<ProcessingProfile, number> = {
  safe: 0,
  anime: 1,
  "live-action": 2,
  "screen-3d": 3,
};
const QUALITY_IDS: Record<QualityLevel, number> = { low: 0, high: 2 };
export interface WebGpuProfileParameters {
  /** Bounded edge/restoration strength; never a generative detail amount. */
  readonly strength: number;
  /** Cross-neighbour denoise amount used only by the live-action branch. */
  readonly denoise: number;
  /** Human-readable strategy used for diagnostics and settings tests. */
  readonly strategy: "bounded-luma" | "edge-aware" | "denoise-unsharp" | "text-safe";
}

export const TEMPORAL_STABILIZATION = Object.freeze({ blend: 0.12, gate: 0.045, maxBlend: 0.18 });

export const WEBGPU_PROFILE_PARAMETERS: Readonly<
  Record<ProcessingProfile, WebGpuProfileParameters>
> = {
  safe: { strength: 0.18, denoise: 0, strategy: "bounded-luma" },
  anime: { strength: 0.32, denoise: 0, strategy: "edge-aware" },
  "live-action": { strength: 0.2, denoise: 0.12, strategy: "denoise-unsharp" },
  "screen-3d": { strength: 0.16, denoise: 0, strategy: "text-safe" },
};

export function getWebGpuProfileParameters(profile: ProcessingProfile): WebGpuProfileParameters {
  return WEBGPU_PROFILE_PARAMETERS[profile];
}

export type WebGpuBackendErrorCode =
  | "already-initialized"
  | "not-initialized"
  | "disposed"
  | "device-lost"
  | "source-size-mismatch"
  | "busy"
  | "frame-consumed"
  | "stale-frame"
  | "gpu-failure";

export class WebGpuBackendError extends Error {
  constructor(
    readonly code: WebGpuBackendErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "WebGpuBackendError";
  }
}

/** Conservative external-texture fallback implementing the canonical contract. */
export class WebGpuBackend implements UpscalerBackend {
  private device: GPUDevice | undefined;
  private context: GPUCanvasContext | undefined;
  private processPipeline: GPURenderPipeline | undefined;
  private presentPipeline: GPURenderPipeline | undefined;
  private sampler: GPUSampler | undefined;
  private uniformBuffer: GPUBuffer | undefined;
  private processedTexture: GPUTexture | undefined;
  private historyTexture: GPUTexture | undefined;
  private temporalUniformBuffer: GPUBuffer | undefined;
  private presentBindGroup: GPUBindGroup | undefined;
  private inputSize: FrameSize = { width: 1, height: 1 };
  private outputSize: FrameSize = { width: 1, height: 1 };
  private profile: ProcessingProfile = "safe";
  private qualityLevel: QualityLevel = "low";
  private onDeviceLost: BackendContext["onDeviceLost"];
  private initialized = false;
  private disposed = false;
  private deviceLost = false;
  private preparing = false;
  private resourceGeneration = 0;
  private nextFrameToken = 0;
  private activeFrameToken: number | undefined;
  private deviceLostListenerGeneration = 0;
  private historyValid = false;

  async initialize(context: BackendContext): Promise<void> {
    if (this.initialized)
      throw new WebGpuBackendError("already-initialized", "WebGPU fallback zaten başlatıldı.");
    if (this.disposed) this.disposed = false;
    this.device = context.device;
    this.context = context.canvasContext;
    this.profile = context.profile ?? "safe";
    this.qualityLevel = context.qualityLevel ?? "low";
    this.onDeviceLost = context.onDeviceLost;
    this.deviceLost = false;
    const device = context.device;
    try {
      this.sampler = device.createSampler({
        label: "Safe WebGPU sampler",
        magFilter: "linear",
        minFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      this.uniformBuffer = device.createBuffer({
        label: "Safe WebGPU parameters",
        size: 48,
        usage: BUFFER_UNIFORM | BUFFER_COPY_DST,
      });
      this.temporalUniformBuffer = device.createBuffer({
        label: "Temporal stabilization parameters",
        size: 16,
        usage: BUFFER_UNIFORM | BUFFER_COPY_DST,
      });
      this.processPipeline = createPipeline(
        device,
        "Safe WebGPU process",
        PROCESS_SHADER,
        "rgba8unorm",
      );
      this.presentPipeline = createPipeline(
        device,
        "Safe WebGPU present",
        PRESENT_SHADER,
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
        if (this.disposed || listenerGeneration !== this.deviceLostListenerGeneration) return;
        this.deviceLost = true;
        this.historyValid = false;
        this.writeTemporalParameters();
        this.activeFrameToken = undefined;
        this.onDeviceLost?.(info);
      });
      await this.resize(context.initialInput, context.initialOutput);
    } catch (error) {
      this.dispose();
      if (error instanceof WebGpuBackendError) throw error;
      throw this.gpuFailure("Safe WebGPU backend başlatılamadı.", error);
    }
  }

  async resize(input: FrameSize, output: FrameSize): Promise<void> {
    this.requireUsable();
    const device = this.requireDevice();
    try {
      await device.queue.onSubmittedWorkDone();
    } catch (error) {
      throw this.gpuFailure("GPU resize öncesinde tamamlanamadı.", error);
    }
    this.requireUsable();
    this.resourceGeneration += 1;
    this.activeFrameToken = undefined;
    this.processedTexture?.destroy();
    this.processedTexture = undefined;
    this.historyTexture?.destroy();
    this.historyTexture = undefined;
    this.historyValid = false;
    this.presentBindGroup = undefined;
    this.inputSize = { ...input };
    this.outputSize = { ...output };
    this.processedTexture = device.createTexture({
      label: "Safe WebGPU prepared frame",
      size: [output.width, output.height],
      format: "rgba8unorm",
      usage: TEXTURE_RENDER_ATTACHMENT | TEXTURE_BINDING | TEXTURE_COPY_SRC,
    });
    this.historyTexture = device.createTexture({
      label: "Temporal stabilization history",
      size: [output.width, output.height],
      format: "rgba8unorm",
      usage: TEXTURE_BINDING | TEXTURE_COPY_DST,
    });
    this.presentBindGroup = device.createBindGroup({
      label: "Safe WebGPU present bindings",
      layout: this.requirePresentPipeline().getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.processedTexture.createView() },
        { binding: 1, resource: this.requireHistoryTexture().createView() },
        { binding: 2, resource: this.requireSampler() },
        { binding: 3, resource: this.requireTemporalUniformBuffer() },
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

  resetTemporal(reason?: string): void {
    void reason;
    this.historyValid = false;
    this.writeTemporalParameters();
  }

  async prepare(source: RenderSource): Promise<PreparedFrame> {
    this.requireUsable();
    if (this.preparing || this.activeFrameToken !== undefined) {
      throw new WebGpuBackendError(
        "busy",
        "Önceki WebGPU karesi sunulmadan veya atılmadan yenisi hazırlanamaz.",
      );
    }
    assertSourceSize(source, this.inputSize);
    const device = this.requireDevice();
    const generation = this.resourceGeneration;
    const frameToken = ++this.nextFrameToken;
    const startedAt = performance.now();
    this.preparing = true;
    try {
      // `GPUDevice.importExternalTexture` is typed for video sources in the
      // current DOM library. ImageBitmap callers are still covered by the
      // shared contract and safely fail into bypass rather than read back.
      if (isImageBitmapSource(source)) {
        throw new WebGpuBackendError(
          "gpu-failure",
          "Safe WebGPU fallback ImageBitmap kaynağını desteklemiyor; orijinal videoya dönülmeli.",
        );
      }
      const externalTexture = device.importExternalTexture({
        source: source as HTMLVideoElement | VideoFrame,
      });
      const bindGroup = device.createBindGroup({
        label: "Safe WebGPU source bindings",
        layout: this.requireProcessPipeline().getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: externalTexture },
          { binding: 1, resource: this.requireSampler() },
          { binding: 2, resource: { buffer: this.requireUniformBuffer() } },
        ],
      });
      const encoder = device.createCommandEncoder({ label: "Prepare safe WebGPU frame" });
      encodePass(
        encoder,
        "Safe WebGPU process",
        this.requireProcessedTexture().createView(),
        this.requireProcessPipeline(),
        bindGroup,
      );
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
      this.requireUsable();
      if (generation !== this.resourceGeneration)
        throw new WebGpuBackendError(
          "stale-frame",
          "Resize sırasında fallback karesi geçersiz kaldı.",
        );
      this.activeFrameToken = frameToken;
      const stats: RenderStats = {
        qualityLevel: this.qualityLevel,
        cpuSubmitMs: performance.now() - startedAt,
        gpuTimeMs: null,
        inputSize: { ...this.inputSize },
        outputSize: { ...this.outputSize },
        passCount: 1,
      };
      return this.createPreparedFrame(frameToken, generation, stats);
    } catch (error) {
      if (error instanceof WebGpuBackendError) throw error;
      throw this.gpuFailure("Safe WebGPU karesi hazırlanamadı.", error);
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
    this.processedTexture?.destroy();
    this.processedTexture = undefined;
    this.historyTexture?.destroy();
    this.historyTexture = undefined;
    this.temporalUniformBuffer?.destroy();
    this.temporalUniformBuffer = undefined;
    this.historyValid = false;
    this.presentBindGroup = undefined;
    this.uniformBuffer?.destroy();
    this.uniformBuffer = undefined;
    this.sampler = undefined;
    this.processPipeline = undefined;
    this.presentPipeline = undefined;
    this.context = undefined;
    this.deviceLostListenerGeneration += 1;
    this.device = undefined;
  }

  private createPreparedFrame(
    frameToken: number,
    generation: number,
    stats: RenderStats,
  ): PreparedFrame {
    let consumed = false;
    const consume = (): void => {
      if (consumed)
        throw new WebGpuBackendError(
          "frame-consumed",
          "Hazırlanan fallback karesi zaten tüketildi.",
        );
      consumed = true;
      if (this.activeFrameToken === frameToken) this.activeFrameToken = undefined;
    };
    return {
      stats,
      present: () => {
        consume();
        this.requireUsable();
        if (generation !== this.resourceGeneration)
          throw new WebGpuBackendError("stale-frame", "Eski boyuta ait fallback karesi sunulmadı.");
        const encoder = this.requireDevice().createCommandEncoder({
          label: "Present safe WebGPU frame",
        });
        encodePass(
          encoder,
          "Safe WebGPU present",
          this.requireContext().getCurrentTexture().createView(),
          this.requirePresentPipeline(),
          this.requirePresentBindGroup(),
        );
        encoder.copyTextureToTexture(
          { texture: this.requireProcessedTexture() },
          { texture: this.requireHistoryTexture() },
          [this.outputSize.width, this.outputSize.height, 1],
        );
        this.requireDevice().queue.submit([encoder.finish()]);
        this.historyValid = true;
        this.writeTemporalParameters();
      },
      discard: consume,
    };
  }

  private writeParameters(): void {
    if (!this.device || !this.uniformBuffer) return;
    const params = getWebGpuProfileParameters(this.profile);
    const buffer = new ArrayBuffer(48);
    const floats = new Float32Array(buffer);
    const uints = new Uint32Array(buffer);
    floats[0] = this.inputSize.width;
    floats[1] = this.inputSize.height;
    floats[2] = this.outputSize.width;
    floats[3] = this.outputSize.height;
    floats[4] = params.strength;
    floats[5] = params.denoise;
    uints[6] = PROFILE_IDS[this.profile];
    uints[7] = QUALITY_IDS[this.qualityLevel];
    this.device.queue.writeBuffer(this.uniformBuffer, 0, buffer);
  }

  private writeTemporalParameters(): void {
    if (!this.device || !this.temporalUniformBuffer) return;
    this.device.queue.writeBuffer(
      this.temporalUniformBuffer,
      0,
      new Float32Array([
        TEMPORAL_STABILIZATION.blend,
        TEMPORAL_STABILIZATION.gate,
        this.historyValid ? 1 : 0,
        0,
      ]),
    );
  }

  private gpuFailure(message: string, cause: unknown): WebGpuBackendError {
    return new WebGpuBackendError(this.deviceLost ? "device-lost" : "gpu-failure", message, {
      cause,
    });
  }
  private requireUsable(): void {
    if (this.disposed) throw new WebGpuBackendError("disposed", "WebGPU fallback dispose edildi.");
    if (!this.initialized)
      throw new WebGpuBackendError("not-initialized", "WebGPU fallback başlatılmadı.");
    if (this.deviceLost)
      throw new WebGpuBackendError(
        "device-lost",
        "WebGPU cihazı kaybedildi; orijinal videoya dönülmeli.",
      );
  }
  private requireDevice(): GPUDevice {
    if (!this.device) throw new WebGpuBackendError("not-initialized", "WebGPU cihazı hazır değil.");
    return this.device;
  }
  private requireContext(): GPUCanvasContext {
    if (!this.context)
      throw new WebGpuBackendError("not-initialized", "WebGPU canvas hazır değil.");
    return this.context;
  }
  private requireSampler(): GPUSampler {
    if (!this.sampler) throw new WebGpuBackendError("not-initialized", "GPU sampler hazır değil.");
    return this.sampler;
  }
  private requireUniformBuffer(): GPUBuffer {
    if (!this.uniformBuffer)
      throw new WebGpuBackendError("not-initialized", "GPU uniform hazır değil.");
    return this.uniformBuffer;
  }
  private requireProcessPipeline(): GPURenderPipeline {
    if (!this.processPipeline)
      throw new WebGpuBackendError("not-initialized", "GPU process pipeline hazır değil.");
    return this.processPipeline;
  }
  private requirePresentPipeline(): GPURenderPipeline {
    if (!this.presentPipeline)
      throw new WebGpuBackendError("not-initialized", "GPU present pipeline hazır değil.");
    return this.presentPipeline;
  }
  private requireProcessedTexture(): GPUTexture {
    if (!this.processedTexture)
      throw new WebGpuBackendError("not-initialized", "GPU output texture hazır değil.");
    return this.processedTexture;
  }
  private requireHistoryTexture(): GPUTexture {
    if (!this.historyTexture)
      throw new WebGpuBackendError("not-initialized", "Temporal history hazır değil.");
    return this.historyTexture;
  }
  private requireTemporalUniformBuffer(): GPUBuffer {
    if (!this.temporalUniformBuffer)
      throw new WebGpuBackendError("not-initialized", "Temporal parametreleri hazır değil.");
    return this.temporalUniformBuffer;
  }
  private requirePresentBindGroup(): GPUBindGroup {
    if (!this.presentBindGroup)
      throw new WebGpuBackendError("not-initialized", "GPU present bind group hazır değil.");
    return this.presentBindGroup;
  }
}

function createPipeline(
  device: GPUDevice,
  label: string,
  shader: string,
  format: GPUTextureFormat,
): GPURenderPipeline {
  const module = device.createShaderModule({ label, code: shader });
  return device.createRenderPipeline({
    label,
    layout: "auto",
    vertex: { module, entryPoint: "vertexMain" },
    fragment: { module, entryPoint: "fragmentMain", targets: [{ format }] },
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
      { view: target, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" },
    ],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3);
  pass.end();
}

function assertSourceSize(source: RenderSource, expected: FrameSize): void {
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
  if (typeof width !== "number" || typeof height !== "number") return;
  if (width !== expected.width || height !== expected.height) {
    throw new WebGpuBackendError(
      "source-size-mismatch",
      `Kaynak boyutu resize gerektiriyor: ${width}×${height}, beklenen ${expected.width}×${expected.height}.`,
    );
  }
}

function isImageBitmapSource(source: RenderSource): source is ImageBitmap {
  return typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap;
}
