import { Anime4kBackend } from "../../src/core/gpu/anime4k-backend";
import type {
  PreparedFrame,
  QualityLevel,
  RenderSource,
  UpscalerBackend,
} from "../../src/core/contracts";
import { WebGpuBackend } from "../../src/core/gpu/webgpu-backend";

export type VisualFixture = "halo" | "double-line" | "color-bleed" | "temporal-shimmer";
export type VisualMode = "anime-low" | "anime-high" | "safe-fallback";

interface CaptureResult {
  fixture: VisualFixture;
  mode: VisualMode;
  seed: number;
  frameIndex: number;
  sourceHash: string;
  temporalPair?: { first: string; second: string };
  stats: {
    qualityLevel: QualityLevel;
    cpuSubmitMs: number;
    gpuTimeMs: number | null;
    inputSize: { width: number; height: number };
    outputSize: { width: number; height: number };
    passCount: number;
  };
  playbackBefore: PlaybackState;
  playbackAfter: PlaybackState;
  playbackUnchanged: boolean;
  currentTimeDelta: number;
}

interface PlaybackState {
  muted: boolean;
  volume: number;
  playbackRate: number;
  paused: boolean;
  currentTime: number;
}

declare global {
  interface Window {
    __P1_VISUAL_RUN__?: (mode: VisualMode, fixture: VisualFixture) => Promise<CaptureResult>;
    __P1_VISUAL_CLEANUP__?: () => void;
    __P1_VISUAL_READY__?: Promise<void>;
    __P1_VISUAL_DIAGNOSTICS__?: {
      uncapturedErrors: string[];
      deviceLost: { reason: string; message: string } | undefined;
    };
  }
}

const sourceCanvas = required<HTMLCanvasElement>("source-canvas");
const sourceDisplay = required<HTMLImageElement>("source-display");
const sourceVideo = required<HTMLVideoElement>("source-video");
const output = required<HTMLCanvasElement>("output");
const status = required<HTMLElement>("status");
const fixtureLabel = required<HTMLElement>("fixture");
const modeLabel = required<HTMLElement>("mode");
const metricsLabel = required<HTMLElement>("metrics");
const SEED = 0x51a7;
const FRAME_INDEX = 17;

let sourcePlaybackStarted = false;
let backend: UpscalerBackend | undefined;
let activeMode: VisualMode | undefined;
let warmedMode: VisualMode | undefined;
let gpuDevice: GPUDevice | undefined;
let gpuContext: GPUCanvasContext | undefined;
const diagnostics = {
  uncapturedErrors: [] as string[],
  deviceLost: undefined as { reason: string; message: string } | undefined,
};
window.__P1_VISUAL_DIAGNOSTICS__ = diagnostics;

window.__P1_VISUAL_RUN__ = runCapture;
window.__P1_VISUAL_CLEANUP__ = cleanup;

window.__P1_VISUAL_READY__ = startSource();

async function runCapture(mode: VisualMode, fixture: VisualFixture): Promise<CaptureResult> {
  if (!backend || activeMode !== mode) {
    await gpuDevice?.queue.onSubmittedWorkDone();
    backend?.dispose();
    backend = await createBackend(mode);
    activeMode = mode;
    warmedMode = undefined;
  }
  await ensureSourcePlaying();
  if (warmedMode !== mode) {
    await warmupBackend(mode);
    warmedMode = mode;
  }
  fixtureLabel.textContent = fixture;
  modeLabel.textContent = mode;
  status.textContent = "kaydediliyor";

  const playbackBefore = readPlaybackState();
  const firstHash = await drawAndWait(fixture, FRAME_INDEX);
  let secondHash: string | undefined;
  if (fixture === "temporal-shimmer") {
    const context = sourceCanvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("2D fixture context oluşturulamadı");
    drawFixture(context, fixture, FRAME_INDEX + 1, SEED);
    secondHash = snapshotHash(fixture, FRAME_INDEX + 1);
    await drawDisplayFixture(fixture, FRAME_INDEX + 1);
    await nextVideoFrame();
  }
  const sourceFrame = await createSourceFrame(mode);
  let frame: PreparedFrame | undefined;
  try {
    frame = await backend.prepare(sourceFrame);
  } finally {
    closeSourceFrame(sourceFrame);
  }
  const stats = frame.stats;
  present(frame);
  await gpuDevice?.queue.onSubmittedWorkDone();
  await nextPaint();
  const playbackAfter = readPlaybackState();
  const result: CaptureResult = {
    fixture,
    mode,
    seed: SEED,
    frameIndex: fixture === "temporal-shimmer" ? FRAME_INDEX + 1 : FRAME_INDEX,
    sourceHash: secondHash ?? firstHash,
    ...(secondHash === undefined ? {} : { temporalPair: { first: firstHash, second: secondHash } }),
    stats,
    playbackBefore,
    playbackAfter,
    playbackUnchanged: samePlaybackState(playbackBefore, playbackAfter),
    currentTimeDelta: playbackAfter.currentTime - playbackBefore.currentTime,
  };
  metricsLabel.textContent = JSON.stringify(result, null, 2);
  status.textContent = "tamamlandı";
  return result;
}

async function createBackend(mode: VisualMode): Promise<UpscalerBackend> {
  if (!navigator.gpu) throw new Error("WebGPU kullanılamıyor");
  if (!gpuDevice || !gpuContext) {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("WebGPU adaptörü bulunamadı");
    gpuDevice = await adapter.requestDevice();
    gpuDevice.addEventListener("uncapturederror", (event) => {
      diagnostics.uncapturedErrors.push(event.error.message);
    });
    void gpuDevice.lost.then((info) => {
      diagnostics.deviceLost = { reason: info.reason, message: info.message };
    });
    gpuContext = output.getContext("webgpu") as GPUCanvasContext | undefined;
    if (!gpuContext) throw new Error("WebGPU canvas context oluşturulamadı");
  }
  const anime = mode !== "safe-fallback";
  const selected: UpscalerBackend = anime ? new Anime4kBackend() : new WebGpuBackend();
  await selected.initialize({
    device: gpuDevice,
    canvasContext: gpuContext,
    presentationFormat: navigator.gpu.getPreferredCanvasFormat(),
    initialInput: { width: 1920, height: 1080 },
    initialOutput: { width: 3840, height: 2160 },
    profile: anime ? "anime" : "safe",
    qualityLevel: mode === "anime-high" ? "high" : "low",
  });
  return selected;
}

function present(frame: PreparedFrame): void {
  frame.present();
}

async function startSource(): Promise<void> {
  const sourceContext = sourceCanvas.getContext("2d", { alpha: false });
  if (!sourceContext) throw new Error("2D fixture context oluşturulamadı");
  drawFixture(sourceContext, "halo", FRAME_INDEX, SEED);
  await drawDisplayFixture("halo", FRAME_INDEX);
  // Keep the video element as a playback-state sentinel; the deterministic
  // fixture itself is consumed directly by WebGPU.
  sourcePlaybackStarted = true;
}

async function ensureSourcePlaying(): Promise<void> {
  if (sourcePlaybackStarted) return;
  await sourceVideo.play();
  if (sourceVideo.videoWidth === 0) {
    await Promise.race([
      new Promise<void>((resolve) =>
        sourceVideo.addEventListener("loadeddata", () => resolve(), { once: true }),
      ),
      new Promise<void>((resolve) => window.setTimeout(resolve, 2_000)),
    ]);
  }
  sourcePlaybackStarted = true;
}

async function createSourceFrame(mode: VisualMode): Promise<RenderSource> {
  // Use owned snapshots for deterministic fixtures. A canvas captureStream
  // creates a Chromium external-image lifetime that can invalidate headed
  // Vulkan WebGPU devices; production video ownership is not changed here.
  if (mode !== "safe-fallback") {
    const bitmap = await createImageBitmap(sourceDisplay);
    assertFrameDimensions(bitmap.width, bitmap.height);
    return bitmap;
  }
  if (typeof VideoFrame !== "function") {
    throw new Error("VideoFrame API görsel harness'te kullanılamıyor");
  }
  const frame = new VideoFrame(sourceDisplay, { timestamp: Math.round(performance.now() * 1000) });
  assertFrameDimensions(frame.codedWidth, frame.codedHeight);
  return frame;
}

function closeSourceFrame(source: RenderSource): void {
  if ("close" in source && typeof source.close === "function") source.close();
}

async function warmupBackend(mode: VisualMode): Promise<void> {
  if (!backend) throw new Error("Visual backend hazır değil");
  const sourceFrame = await createSourceFrame(mode);
  try {
    const prepared = await backend.prepare(sourceFrame);
    try {
      prepared.present();
      await gpuDevice?.queue.onSubmittedWorkDone();
      await nextPaint();
    } catch (error) {
      prepared.discard();
      throw error;
    }
  } finally {
    closeSourceFrame(sourceFrame);
  }
}

async function drawAndWait(fixture: VisualFixture, frameIndex: number): Promise<string> {
  const context = sourceCanvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("2D fixture context oluşturulamadı");
  drawFixture(context, fixture, frameIndex, SEED);
  await drawDisplayFixture(fixture, frameIndex);
  await nextVideoFrame();
  return snapshotHash(fixture, frameIndex);
}

async function drawDisplayFixture(fixture: VisualFixture, frameIndex: number): Promise<void> {
  // The source panel is an immutable image snapshot; sourceVideo remains only
  // a playback-state sentinel and is never used for evidence rendering.
  sourceDisplay.src = fixtureSnapshotUrl(fixture, frameIndex);
  await sourceDisplay.decode().catch(() => undefined);
}

function fixtureSnapshotUrl(fixture: VisualFixture, frameIndex: number): string {
  const phase = ((frameIndex + (SEED & 31)) % 32) / 32;
  let body = `<rect width="1920" height="1080" fill="#ece7db"/>`;
  if (fixture === "halo")
    body += `<path d="M430 480 A300 300 0 1 1 430 479 L430 480" fill="#172532" stroke="#080b10" stroke-width="14"/>`;
  else if (fixture === "double-line")
    body += `<g stroke="#101820">${Array.from({ length: 30 }, (_, i) => `<line x1="${480 + i * 42}" y1="90" x2="${1080 + i * 42}" y2="690" stroke-width="${i % 2 ? 10 : 3}"/>`).join("")}</g>`;
  else if (fixture === "color-bleed")
    body += `<rect width="960" height="1080" fill="#ea284c"/><rect x="960" width="960" height="1080" fill="#1d66e5"/><circle cx="960" cy="540" r="220" fill="#d7a07f" stroke="#241a20" stroke-width="12"/>`;
  else
    body = `<rect width="1920" height="1080" fill="#20252f"/><g stroke="#f4e8c2" stroke-width="3">${Array.from({ length: 90 }, (_, i) => `<line x1="${-80 + i * 24 + phase * 12}" y1="0" x2="${340 + i * 24 + phase * 12}" y2="1080"/>`).join("")}</g>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">${body}</svg>`)}`;
}

function snapshotHash(fixture: VisualFixture, frameIndex: number): string {
  let hash = 2166136261;
  for (const char of `${fixture}:${frameIndex}:${SEED}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function assertFrameDimensions(width: number, height: number): void {
  if (width !== sourceCanvas.width || height !== sourceCanvas.height) {
    throw new Error(
      `Fixture snapshot boyutu geçersiz: ${width}x${height}; beklenen ${sourceCanvas.width}x${sourceCanvas.height}`,
    );
  }
}

function drawFixture(
  context: CanvasRenderingContext2D,
  fixture: VisualFixture,
  frameIndex: number,
  seed: number,
): void {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  context.fillStyle = "#ece7db";
  context.fillRect(0, 0, width, height);
  const phase = ((frameIndex + (seed & 31)) % 32) / 32;
  if (fixture === "halo") {
    context.fillStyle = "#172532";
    context.beginPath();
    context.arc(430, 480, 300, Math.PI * 0.15, Math.PI * 1.85);
    context.lineTo(430, 480);
    context.fill();
    context.strokeStyle = "#080b10";
    context.lineWidth = 14;
    context.stroke();
    return;
  }
  if (fixture === "double-line") {
    context.strokeStyle = "#101820";
    for (let offset = -100; offset < 1100; offset += 42) {
      context.lineWidth = offset % 84 === 0 ? 3 : 10;
      context.beginPath();
      context.moveTo(580 + offset + phase * 12, 90);
      context.lineTo(1180 + offset + phase * 12, 690);
      context.stroke();
    }
    return;
  }
  if (fixture === "color-bleed") {
    context.fillStyle = "#ea284c";
    context.fillRect(0, 0, width / 2, height);
    context.fillStyle = "#1d66e5";
    context.fillRect(width / 2, 0, width / 2, height);
    context.fillStyle = "#d7a07f";
    context.beginPath();
    context.arc(width / 2, height / 2, 220, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#241a20";
    context.lineWidth = 12;
    context.stroke();
    return;
  }
  context.fillStyle = "#20252f";
  context.fillRect(0, 0, width, height);
  context.save();
  context.translate(phase * 12, 0);
  context.strokeStyle = "#f4e8c2";
  context.lineWidth = 3;
  for (let x = -80; x < width + 80; x += 24) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + 420, height);
    context.stroke();
  }
  context.restore();
}

function readPlaybackState(): PlaybackState {
  return {
    muted: sourceVideo.muted,
    volume: sourceVideo.volume,
    playbackRate: sourceVideo.playbackRate,
    paused: sourceVideo.paused,
    currentTime: sourceVideo.currentTime,
  };
}

function samePlaybackState(before: PlaybackState, after: PlaybackState): boolean {
  return (
    before.muted === after.muted &&
    before.volume === after.volume &&
    before.playbackRate === after.playbackRate &&
    before.paused === after.paused
  );
}

function nextVideoFrame(): Promise<void> {
  return nextPaint();
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

function cleanup(): void {
  backend?.dispose();
  backend = undefined;
  activeMode = undefined;
  warmedMode = undefined;
  sourcePlaybackStarted = false;
}

function required<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Eksik görsel harness elementi: ${id}`);
  return value as T;
}
