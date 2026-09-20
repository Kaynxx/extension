import { describe, expect, it, vi } from "vitest";
import {
  Anime4kBackend,
  validateAnimeScale,
  validateDirect2x,
} from "../../src/core/gpu/anime4k-backend";
import type { Anime4kBackendError } from "../../src/core/gpu/anime4k-backend";
import { ANIME_PROFILE_LEVELS, getAnimePassCount } from "../../src/core/profiles/anime-profile";
import { ANIME_PRESENT_SHADER } from "../../src/core/models/anime4k-shaders";

describe("Anime4K direct x2 contract", () => {
  it("accepts the 1080p to 4K direct x2 route", () => {
    expect(() =>
      validateDirect2x({ width: 1920, height: 1080 }, { width: 3840, height: 2160 }),
    ).not.toThrow();
  });

  it("rejects non-x2 output instead of silently resampling", () => {
    expect(() =>
      validateDirect2x({ width: 1920, height: 1080 }, { width: 2560, height: 1440 }),
    ).toThrowError(
      expect.objectContaining<Partial<Anime4kBackendError>>({
        code: "invalid-scale",
      }),
    );
  });

  it("accepts the direct 720p to 4K x3 route", () => {
    expect(() =>
      validateAnimeScale({ width: 1280, height: 720 }, { width: 3840, height: 2160 }),
    ).not.toThrow();
  });

  it("rejects arbitrary ratios instead of silently resampling", () => {
    expect(() =>
      validateAnimeScale({ width: 1920, height: 1080 }, { width: 2560, height: 1440 }),
    ).toThrowError(
      expect.objectContaining<Partial<Anime4kBackendError>>({
        code: "invalid-scale",
      }),
    );
  });
});

describe("Anime4K performance levels", () => {
  it("uses one processing pass for low and two for high", () => {
    expect(getAnimePassCount("low")).toBe(1);
    expect(getAnimePassCount("high")).toBe(2);
    expect(ANIME_PROFILE_LEVELS.high.passCount).toBeGreaterThan(ANIME_PROFILE_LEVELS.low.passCount);
  });

  it("keeps both levels non-generative and high restoration bounded", () => {
    expect(ANIME_PROFILE_LEVELS.low.generative).toBe(false);
    expect(ANIME_PROFILE_LEVELS.high.generative).toBe(false);
    expect(ANIME_PROFILE_LEVELS.low.lineStrength).toBe(0);
    expect(ANIME_PROFILE_LEVELS.high.lineStrength).toBeGreaterThan(0);
    expect(ANIME_PROFILE_LEVELS.high.lineStrength).toBeLessThanOrEqual(0.2);
  });
  it("uses temporal bindings only in the presentation shader", () => {
    expect(ANIME_PRESENT_SHADER).toContain("historyTexture");
    expect(ANIME_PRESENT_SHADER).toContain("historyValid");
  });

  it("reports the pass count executed by prepare for both levels", async () => {
    const gpu = createFakeGpu();
    const backend = new Anime4kBackend();
    await backend.initialize({
      device: gpu.device,
      canvasContext: gpu.context,
      presentationFormat: "bgra8unorm",
      initialInput: { width: 1920, height: 1080 },
      initialOutput: { width: 3840, height: 2160 },
      profile: "anime",
      qualityLevel: "low",
    });
    const source = {
      videoWidth: 1920,
      videoHeight: 1080,
    } as HTMLVideoElement;

    const low = await backend.prepare(source);
    expect(low.stats.passCount).toBe(1);
    expect(gpu.preparationPasses()).toBe(1);
    low.discard();

    backend.setQualityLevel("high");
    const high = await backend.prepare(source);
    expect(high.stats.passCount).toBe(2);
    expect(gpu.preparationPasses()).toBe(3);
    high.discard();
    backend.dispose();
  });

  it("routes temporal reset through Anime4K prepared presentation", async () => {
    const gpu = createFakeGpu();
    const backend = new Anime4kBackend();
    await backend.initialize({
      device: gpu.device,
      canvasContext: gpu.context,
      presentationFormat: "bgra8unorm",
      initialInput: { width: 1920, height: 1080 },
      initialOutput: { width: 3840, height: 2160 },
      profile: "anime",
      qualityLevel: "low",
    });
    const frame = await backend.prepare({
      videoWidth: 1920,
      videoHeight: 1080,
    } as HTMLVideoElement);
    frame.present();
    backend.resetTemporal("scene-cut");
    expect(gpu.resourceCreations().buffers).toBeGreaterThanOrEqual(2);
    backend.dispose();
  });

  it("initializes the direct x3 route without changing its pass map", async () => {
    const gpu = createFakeGpu();
    const backend = new Anime4kBackend();
    await backend.initialize({
      device: gpu.device,
      canvasContext: gpu.context,
      presentationFormat: "bgra8unorm",
      initialInput: { width: 1280, height: 720 },
      initialOutput: { width: 3840, height: 2160 },
      profile: "anime",
      qualityLevel: "high",
    });

    const frame = await backend.prepare({
      videoWidth: 1280,
      videoHeight: 720,
    } as HTMLVideoElement);
    expect(frame.stats.outputSize).toEqual({ width: 3840, height: 2160 });
    expect(frame.stats.passCount).toBe(2);
    frame.discard();
    backend.dispose();
  });

  it("invalidates a prepared frame after resize before it can blit", async () => {
    const gpu = createFakeGpu();
    const backend = new Anime4kBackend();
    await backend.initialize({
      device: gpu.device,
      canvasContext: gpu.context,
      presentationFormat: "bgra8unorm",
      initialInput: { width: 1920, height: 1080 },
      initialOutput: { width: 3840, height: 2160 },
      profile: "anime",
      qualityLevel: "low",
    });
    const frame = await backend.prepare({
      videoWidth: 1920,
      videoHeight: 1080,
    } as HTMLVideoElement);

    await backend.resize({ width: 1280, height: 720 }, { width: 3840, height: 2160 });
    expect(() => frame.present()).toThrowError(
      expect.objectContaining<Partial<Anime4kBackendError>>({
        code: "stale-frame",
      }),
    );
    backend.dispose();
  });

  it("keeps textures and uniform buffers out of the per-frame path", async () => {
    const gpu = createFakeGpu();
    const backend = new Anime4kBackend();
    await backend.initialize({
      device: gpu.device,
      canvasContext: gpu.context,
      presentationFormat: "bgra8unorm",
      initialInput: { width: 1920, height: 1080 },
      initialOutput: { width: 3840, height: 2160 },
      profile: "anime",
      qualityLevel: "low",
    });
    const allocated = gpu.resourceCreations();

    const first = await backend.prepare({
      videoWidth: 1920,
      videoHeight: 1080,
    } as HTMLVideoElement);
    first.discard();
    const second = await backend.prepare({
      videoWidth: 1920,
      videoHeight: 1080,
    } as HTMLVideoElement);
    second.discard();

    expect(gpu.resourceCreations()).toEqual(allocated);
    backend.dispose();
  });

  it("surfaces device loss and rejects subsequent GPU work safely", async () => {
    const gpu = createFakeGpu();
    const onDeviceLost = vi.fn();
    const backend = new Anime4kBackend();
    await backend.initialize({
      device: gpu.device,
      canvasContext: gpu.context,
      presentationFormat: "bgra8unorm",
      initialInput: { width: 1920, height: 1080 },
      initialOutput: { width: 3840, height: 2160 },
      profile: "anime",
      qualityLevel: "low",
      onDeviceLost,
    });

    gpu.loseDevice();
    await Promise.resolve();
    expect(onDeviceLost).toHaveBeenCalledTimes(1);
    expect(() => backend.setQualityLevel("high")).toThrowError(
      expect.objectContaining<Partial<Anime4kBackendError>>({
        code: "device-lost",
      }),
    );
    backend.dispose();
  });

  it("makes prepared frames single-use", async () => {
    const gpu = createFakeGpu();
    const backend = new Anime4kBackend();
    await backend.initialize({
      device: gpu.device,
      canvasContext: gpu.context,
      presentationFormat: "bgra8unorm",
      initialInput: { width: 2, height: 2 },
      initialOutput: { width: 4, height: 4 },
      profile: "anime",
      qualityLevel: "low",
    });
    const frame = await backend.prepare({
      width: 2,
      height: 2,
    } as ImageBitmap);

    frame.discard();
    expect(() => frame.present()).toThrowError(
      expect.objectContaining<Partial<Anime4kBackendError>>({
        code: "frame-consumed",
      }),
    );
    backend.dispose();
  });
});

function createFakeGpu(): {
  device: GPUDevice;
  context: GPUCanvasContext;
  preparationPasses(): number;
  resourceCreations(): { textures: number; buffers: number };
  loseDevice(): void;
} {
  let passCount = 0;
  let textureCreations = 0;
  let bufferCreations = 0;
  const queue = {
    onSubmittedWorkDone: () => Promise.resolve(),
    writeBuffer: () => undefined,
    copyExternalImageToTexture: () => undefined,
    submit: () => undefined,
  };
  const createView = () => ({}) as GPUTextureView;
  const createTexture = () => {
    textureCreations += 1;
    return { createView, destroy: () => undefined } as unknown as GPUTexture;
  };
  const createPipeline = () => ({ getBindGroupLayout: () => ({}) }) as unknown as GPURenderPipeline;
  const createCommandEncoder = () =>
    ({
      beginRenderPass: () => {
        passCount += 1;
        return {
          setPipeline: () => undefined,
          setBindGroup: () => undefined,
          draw: () => undefined,
          end: () => undefined,
        };
      },
      copyTextureToTexture: () => undefined,
      finish: () => ({}),
    }) as unknown as GPUCommandEncoder;
  let resolveLost: ((info: GPUDeviceLostInfo) => void) | undefined;
  const lost = new Promise<GPUDeviceLostInfo>((resolve) => {
    resolveLost = resolve;
  });
  const device = {
    queue,
    lost,
    createSampler: () => ({}),
    createBuffer: () => {
      bufferCreations += 1;
      return { destroy: () => undefined };
    },
    createShaderModule: () => ({}),
    createRenderPipeline: createPipeline,
    createTexture,
    createBindGroup: () => ({}),
    createCommandEncoder,
  } as unknown as GPUDevice;
  const context = {
    configure: () => undefined,
    getCurrentTexture: createTexture,
  } as unknown as GPUCanvasContext;
  return {
    device,
    context,
    preparationPasses: () => passCount,
    resourceCreations: () => ({ textures: textureCreations, buffers: bufferCreations }),
    loseDevice: () =>
      resolveLost?.({ reason: "unknown", message: "test device loss" } as GPUDeviceLostInfo),
  };
}
