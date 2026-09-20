import { Anime4kBackend } from "../../src/core/gpu/anime4k-backend";
import type { PreparedFrame, RenderSource } from "../../src/core/contracts";

type Scenario = "shimmer" | "fast-pan" | "scene-cut";
type Run = { temporal: boolean; fps: 30 | 60; scenario: Scenario };
const source = document.querySelector<HTMLCanvasElement>("#source")!;
const output = document.querySelector<HTMLCanvasElement>("#output")!;
const status = document.querySelector<HTMLElement>("#status")!;
const ctx = source.getContext("2d", { alpha: false })!;
const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
if (!adapter) throw new Error("WebGPU adapter yok");
const device = await adapter.requestDevice();
const gpuErrors: string[] = [];
device.addEventListener("uncapturederror", (event) => gpuErrors.push(event.error.message));
const gpu = output.getContext("webgpu") as GPUCanvasContext;
const format = navigator.gpu.getPreferredCanvasFormat();
const backend = new Anime4kBackend();
await backend.initialize({
  device,
  canvasContext: gpu,
  presentationFormat: format,
  initialInput: { width: 640, height: 360 },
  initialOutput: { width: 1280, height: 720 },
  profile: "anime",
  qualityLevel: "low",
});
backend.setTemporalEnabled(false);
const frames: Record<string, { hash: string; cpuSubmitMs: number; meanLuma: number }[]> = {};
(
  window as Window & {
    __P4_RUN__?: (run: Run) => Promise<unknown>;
    __P4_COLOR_CHECK__?: () => Promise<{ first: string; second: string; changed: boolean }>;
    __P4_STOP__?: () => void;
  }
).__P4_RUN__ = async (run) => {
  backend.resetTemporal("manual");
  backend.setTemporalEnabled(run.temporal);
  const key = `${run.temporal ? "on" : "off"}-${run.fps}-${run.scenario}`;
  const samples: { hash: string; cpuSubmitMs: number; meanLuma: number }[] = [];
  const count = run.fps === 60 ? 12 : 8;
  for (let i = 0; i < count; i += 1) {
    draw(run.scenario, i);
    await new Promise(requestAnimationFrame);
    const frame: RenderSource = await createImageBitmap(source);
    let prepared: PreparedFrame | undefined;
    try {
      prepared = await backend.prepare(frame);
      const readback = await backend.debugReadbackFinalTexture();
      prepared.present();
      await device.queue.onSubmittedWorkDone();
      samples.push({
        hash: hashPixels(readback.pixels),
        meanLuma: meanLuma(readback.pixels),
        cpuSubmitMs: prepared.stats.cpuSubmitMs,
      });
    } finally {
      frame.close();
    }
  }
  frames[key] = samples;
  status.textContent = key;
  return {
    key,
    fps: run.fps,
    temporal: run.temporal,
    scenario: run.scenario,
    frames: samples,
    resetGeneration: true,
    gpuErrors,
    outputSize: { width: output.width, height: output.height },
  };
};
(window as Window & { __P4_COLOR_CHECK__?: () => Promise<unknown> }).__P4_COLOR_CHECK__ =
  async () => {
    backend.setTemporalEnabled(false);
    const hashes: string[] = [];
    for (const color of ["#e83d52", "#1d66e5"]) {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, source.width, source.height);
      await new Promise(requestAnimationFrame);
      const frame = await createImageBitmap(source);
      let prepared: PreparedFrame | undefined;
      try {
        prepared = await backend.prepare(frame);
        prepared.present();
        await device.queue.onSubmittedWorkDone();
        hashes.push(hashPixels((await backend.debugReadbackFinalTexture()).pixels));
      } finally {
        frame.close();
      }
    }
    return { first: hashes[0] ?? "", second: hashes[1] ?? "", changed: hashes[0] !== hashes[1] };
  };
(window as Window & { __P4_RUN__?: unknown; __P4_STOP__?: () => void }).__P4_STOP__ = () => {
  backend.dispose();
  device.destroy();
};
function draw(s: Scenario, i: number): void {
  ctx.fillStyle = s === "scene-cut" && i >= 4 ? "#e83d52" : "#202630";
  ctx.fillRect(0, 0, 640, 360);
  ctx.strokeStyle = "#f5e7b0";
  ctx.lineWidth = 2;
  const shift = s === "fast-pan" ? i * 18 : s === "shimmer" ? i * 0.7 : 0;
  for (let x = -200; x < 900; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x + shift, 0);
    ctx.lineTo(x + shift + 170, 360);
    ctx.stroke();
  }
}
function hashPixels(pixels: Uint8Array): string {
  let h = 2166136261;
  for (const value of pixels) h = Math.imul(h ^ value, 16777619);
  return (h >>> 0).toString(16);
}

function meanLuma(pixels: Uint8Array): number {
  let total = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    total +=
      0.2126 * (pixels[i] ?? 0) + 0.7152 * (pixels[i + 1] ?? 0) + 0.0722 * (pixels[i + 2] ?? 0);
  }
  return total / (pixels.length / 4);
}
