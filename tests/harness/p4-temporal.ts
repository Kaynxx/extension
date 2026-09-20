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
  const samples: {
    hash: string;
    cpuSubmitMs: number;
    meanLuma: number;
    cpuHash: string;
    cpuLuma?: number;
    bitmapHash?: string;
    bitmapLuma?: number;
    sourceHash: string;
    finalHash: string;
    bitmapSize: { width: number; height: number };
  }[] = [];
  const count = run.fps === 60 ? 12 : 8;
  for (let i = 0; i < count; i += 1) {
    draw(run.scenario, i);
    await new Promise(requestAnimationFrame);
    const cpuPixels = ctx.getImageData(0, 0, source.width, source.height).data;
    const frame: RenderSource = await createImageBitmap(source);
    let prepared: PreparedFrame | undefined;
    try {
      prepared = await backend.prepare(frame);
      const sourceReadback = await backend.debugReadbackSourceTexture();
      const finalReadback = await backend.debugReadbackFinalTexture();
      prepared.present();
      await device.queue.onSubmittedWorkDone();
      const temporalReadback = await backend.debugReadbackTemporalOutput();
      samples.push({
        hash: await hashPixels(temporalReadback.pixels),
        meanLuma: meanLuma(temporalReadback.pixels),
        sourceHash: await hashPixels(sourceReadback.pixels),
        finalHash: await hashPixels(finalReadback.pixels),
        bitmapSize: { width: frame.width, height: frame.height },
        cpuHash: await hashPixels(cpuPixels),
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
    const stages: {
      color: string;
      cpuHash: string;
      bitmapSize: { width: number; height: number };
      sourceHash: string;
      finalHash: string;
      temporalHash: string;
      cpuLuma: number;
      bitmapHash: string;
      bitmapLuma: number;
      sourceLuma: number;
      finalLuma: number;
      temporalLuma: number;
    }[] = [];
    for (const [index, color] of ["#e83d52", "#1d66e5"].entries()) {
      draw("scene-cut", index === 0 ? 0 : 4);
      await new Promise(requestAnimationFrame);
      const cpuPixels = ctx.getImageData(0, 0, source.width, source.height).data;
      const frame = await createImageBitmap(source);
      const roundtrip = document.createElement("canvas");
      roundtrip.width = source.width;
      roundtrip.height = source.height;
      const roundtripContext = roundtrip.getContext("2d", { willReadFrequently: true })!;
      roundtripContext.drawImage(frame, 0, 0);
      const bitmapPixels = roundtripContext.getImageData(0, 0, source.width, source.height).data;
      let prepared: PreparedFrame | undefined;
      try {
        prepared = await backend.prepare(frame);
        const sourceReadback = await backend.debugReadbackSourceTexture();
        const finalReadback = await backend.debugReadbackFinalTexture();
        prepared.present();
        await device.queue.onSubmittedWorkDone();
        const temporalReadback = await backend.debugReadbackTemporalOutput();
        stages.push({
          color,
          cpuHash: await hashPixels(cpuPixels),
          cpuLuma: meanLuma(cpuPixels),
          bitmapHash: await hashPixels(bitmapPixels),
          bitmapLuma: meanLuma(bitmapPixels),
          bitmapSize: { width: frame.width, height: frame.height },
          sourceHash: await hashPixels(sourceReadback.pixels),
          finalHash: await hashPixels(finalReadback.pixels),
          temporalHash: await hashPixels(temporalReadback.pixels),
          sourceLuma: meanLuma(sourceReadback.pixels),
          finalLuma: meanLuma(finalReadback.pixels),
          temporalLuma: meanLuma(temporalReadback.pixels),
        });
      } finally {
        frame.close();
      }
    }
    return {
      stages,
      first: stages[0]?.temporalHash ?? "",
      second: stages[1]?.temporalHash ?? "",
      changed: stages[0]?.temporalHash !== stages[1]?.temporalHash,
    };
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
async function hashPixels(pixels: ArrayLike<number>): Promise<string> {
  const bytes = Uint8Array.from({ length: pixels.length }, (_, index) => pixels[index] ?? 0);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}

function meanLuma(pixels: ArrayLike<number>): number {
  let total = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    total +=
      0.2126 * (pixels[i] ?? 0) + 0.7152 * (pixels[i + 1] ?? 0) + 0.0722 * (pixels[i + 2] ?? 0);
  }
  return total / (pixels.length / 4);
}
