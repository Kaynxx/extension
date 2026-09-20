import { WebGpuBackend } from "../../src/core/gpu/webgpu-backend";
import type { ProcessingProfile } from "../../src/core/contracts";

type Profile = "live-action" | "screen-3d";
interface MatrixResult {
  profile: Profile;
  fps: number;
  scale: number;
  frames: number;
  input: { width: number; height: number };
  output: { width: number; height: number };
  browser: string;
  backend: "WebGpuBackend";
  modelIdentity: "bundled-webgpu-baseline";
  processingSamplesMs: number[];
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  presented: number;
  failed: number;
  gpuErrors: string[];
  proxyMetrics: {
    metricKind: "deterministic-input-proxy";
    edgeRatio: number;
    haloProxy: number;
    textIntegrityProxy: number;
  };
}

declare global {
  interface Window {
    __P2P3_RUN__?: (
      profile: Profile,
      fps: number,
      scale: number,
      frames: number,
    ) => Promise<MatrixResult>;
  }
}

const sourceElement = document.querySelector<HTMLCanvasElement>("#source");
const outputElement = document.querySelector<HTMLCanvasElement>("#output");
const videoElement = document.querySelector<HTMLVideoElement>("#video");
if (!sourceElement || !outputElement || !videoElement)
  throw new Error("P2/P3 harness element eksik");
const source = sourceElement;
const output = outputElement;
const video = videoElement;
video.style.display = "none";
source.style.display = "none";
output.width = 3840;
output.height = 2160;

window.__P2P3_RUN__ = async (profile, fps, scale, frames) => {
  if (!navigator.gpu) throw new Error("WebGPU kullanılamıyor");
  const input = scale === 2 ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
  source.width = input.width;
  source.height = input.height;
  drawFixture(profile);
  const stream = source.captureStream(fps);
  video.srcObject = stream;
  await video.play();
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("GPU adaptörü bulunamadı");
  const device = await adapter.requestDevice();
  const gpuErrors: string[] = [];
  device.addEventListener("uncapturederror", (event) => gpuErrors.push(event.error.message));
  const context = output.getContext("webgpu") as GPUCanvasContext | null;
  if (!context) throw new Error("WebGPU canvas context yok");
  const format = navigator.gpu.getPreferredCanvasFormat();
  const backend = new WebGpuBackend();
  await backend.initialize({
    device,
    canvasContext: context,
    presentationFormat: format,
    initialInput: input,
    initialOutput: { width: 3840, height: 2160 },
    profile: profile as ProcessingProfile,
    qualityLevel: "low",
  });
  const samples: number[] = [];
  let failed = 0;
  try {
    for (let index = 0; index < 8; index += 1) await nextFrame();
    for (let index = 0; index < frames; index += 1) {
      await nextFrame();
      try {
        const prepared = await backend.prepare(video);
        samples.push(prepared.stats.cpuSubmitMs);
        prepared.present();
      } catch (error) {
        failed += 1;
        throw error;
      }
    }
    await device.queue.onSubmittedWorkDone();
  } finally {
    backend.dispose();
    device.destroy();
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }
  return {
    profile,
    fps,
    scale,
    frames,
    input,
    output: { width: 3840, height: 2160 },
    browser: navigator.userAgent,
    backend: "WebGpuBackend",
    modelIdentity: "bundled-webgpu-baseline",
    processingSamplesMs: samples,
    ...summarize(samples),
    presented: samples.length,
    failed,
    gpuErrors,
    proxyMetrics: proxyMetrics(profile),
  };
};

function nextFrame(): Promise<void> {
  return new Promise((resolve) => video.requestVideoFrameCallback(() => resolve()));
}

function summarize(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (ratio: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
  return { p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99) };
}

function drawFixture(profile: Profile): void {
  const context = source.getContext("2d", { alpha: false });
  if (!context) throw new Error("P2/P3 fixture context yok");
  context.fillStyle = profile === "screen-3d" ? "#101820" : "#b7c8d1";
  context.fillRect(0, 0, source.width, source.height);
  context.strokeStyle = profile === "screen-3d" ? "#f4e8c2" : "#27343d";
  context.fillStyle = profile === "screen-3d" ? "#f4e8c2" : "#d6a887";
  context.lineWidth = Math.max(2, source.width / 640);
  for (let x = 40; x < source.width; x += Math.max(48, source.width / 12)) {
    context.beginPath();
    context.moveTo(x, 40);
    context.lineTo(x + source.width / 5, source.height - 40);
    context.stroke();
  }
  context.font = `${Math.max(24, source.width / 24)}px sans-serif`;
  context.fillText(
    profile === "screen-3d" ? "UI 0123 AaBb" : "natural texture",
    80,
    source.height / 2,
  );
}

function proxyMetrics(profile: Profile) {
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("P2/P3 proxy context yok");
  const pixels = context.getImageData(0, 0, source.width, source.height).data;
  let edge = 0;
  let halo = 0;
  for (let index = 0; index < pixels.length - 4; index += 4) {
    const delta = Math.abs((pixels[index] ?? 0) - (pixels[index + 4] ?? 0));
    if (delta > 24) edge += 1;
    if (delta > 180) halo += 1;
  }
  const area = source.width * source.height;
  return {
    metricKind: "deterministic-input-proxy" as const,
    edgeRatio: edge / area,
    haloProxy: halo / area,
    textIntegrityProxy: profile === "screen-3d" ? 1 : 0,
  };
}
