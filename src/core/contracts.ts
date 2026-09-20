import type { ContentProfile } from "./settings";

/** Runtime levels shared by every production backend. */
export type QualityLevel = "low" | "high";

export type ProcessingProfile = Exclude<ContentProfile, "auto">;

export interface FrameSize {
  width: number;
  height: number;
}

export type RenderSource = HTMLVideoElement | VideoFrame | ImageBitmap;

export interface BackendContext {
  device: GPUDevice;
  canvasContext: GPUCanvasContext;
  presentationFormat: GPUTextureFormat;
  initialInput: FrameSize;
  initialOutput: FrameSize;
  profile: ProcessingProfile;
  qualityLevel: QualityLevel;
  onDeviceLost?: (info: GPUDeviceLostInfo) => void;
}

export interface RenderStats {
  qualityLevel: QualityLevel;
  cpuSubmitMs: number;
  gpuTimeMs: number | null;
  inputSize: FrameSize;
  outputSize: FrameSize;
  passCount: number;
}

/**
 * A processed frame that has not been made visible yet.
 *
 * The scheduler owns this object and must call exactly one of `present` or
 * `discard`. Deferring presentation is what lets a newer video frame supersede
 * completed GPU work without ever placing stale output on the overlay canvas.
 */
export interface PreparedFrame {
  stats: RenderStats;
  present(): void;
  discard(): void;
}

export interface UpscalerBackend {
  initialize(context: BackendContext): Promise<void>;
  resize(input: FrameSize, output: FrameSize): Promise<void>;
  setQualityLevel(level: QualityLevel): void;
  prepare(source: RenderSource): Promise<PreparedFrame>;
  resetTemporal?(reason: string): void;
  dispose(): void;
}
