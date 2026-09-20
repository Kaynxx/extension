import { describe, expect, it, vi } from "vitest";
import { getWebGpuProfileParameters, WebGpuBackend } from "../../src/core/gpu/webgpu-backend";
import type { WebGpuBackendError } from "../../src/core/gpu/webgpu-backend";

describe("WebGpuBackend canonical safe fallback", () => {
  it("keeps profile strategies conservative and distinct", () => {
    expect(getWebGpuProfileParameters("live-action").strategy).toBe("denoise-unsharp");
    expect(getWebGpuProfileParameters("screen-3d").strategy).toBe("text-safe");
    expect(getWebGpuProfileParameters("screen-3d").strength).toBeLessThan(
      getWebGpuProfileParameters("live-action").strength,
    );
  });
  it("prepares an offscreen frame and presents it only through the prepared handle", async () => {
    const gpu = createFakeGpu();
    const backend = new WebGpuBackend();
    await backend.initialize({
      device: gpu.device,
      canvasContext: gpu.context,
      presentationFormat: "bgra8unorm",
      initialInput: { width: 1920, height: 1080 },
      initialOutput: { width: 3840, height: 2160 },
      profile: "safe",
      qualityLevel: "low",
    });

    const frame = await backend.prepare({
      videoWidth: 1920,
      videoHeight: 1080,
    } as HTMLVideoElement);
    expect(frame.stats).toMatchObject({
      qualityLevel: "low",
      inputSize: { width: 1920, height: 1080 },
      outputSize: { width: 3840, height: 2160 },
      passCount: 1,
    });
    expect(gpu.presentPasses()).toBe(0);
    frame.present();
    expect(gpu.presentPasses()).toBe(1);
    expect(() => frame.discard()).toThrowError(
      expect.objectContaining<Partial<WebGpuBackendError>>({ code: "frame-consumed" }),
    );
    backend.dispose();
  });

  it("invalidates a prepared frame after resize without destroying the injected device", async () => {
    const gpu = createFakeGpu();
    const backend = new WebGpuBackend();
    await backend.initialize({
      device: gpu.device,
      canvasContext: gpu.context,
      presentationFormat: "bgra8unorm",
      initialInput: { width: 1920, height: 1080 },
      initialOutput: { width: 3840, height: 2160 },
      profile: "safe",
      qualityLevel: "low",
    });
    const frame = await backend.prepare({
      videoWidth: 1920,
      videoHeight: 1080,
    } as HTMLVideoElement);
    await backend.resize({ width: 1280, height: 720 }, { width: 2560, height: 1440 });
    expect(() => frame.present()).toThrowError(
      expect.objectContaining<Partial<WebGpuBackendError>>({ code: "stale-frame" }),
    );
    backend.dispose();
    expect(gpu.destroyDevice).not.toHaveBeenCalled();
  });

  it("surfaces device loss and rejects new work for safe bypass", async () => {
    const gpu = createFakeGpu();
    const onDeviceLost = vi.fn();
    const backend = new WebGpuBackend();
    await backend.initialize({
      device: gpu.device,
      canvasContext: gpu.context,
      presentationFormat: "bgra8unorm",
      initialInput: { width: 2, height: 2 },
      initialOutput: { width: 4, height: 4 },
      profile: "safe",
      qualityLevel: "low",
      onDeviceLost,
    });
    gpu.loseDevice();
    await Promise.resolve();
    expect(onDeviceLost).toHaveBeenCalledTimes(1);
    await expect(
      backend.prepare({ videoWidth: 2, videoHeight: 2 } as HTMLVideoElement),
    ).rejects.toThrow(
      expect.objectContaining<Partial<WebGpuBackendError>>({ code: "device-lost" }),
    );
    backend.dispose();
  });
});

function createFakeGpu(): {
  device: GPUDevice;
  context: GPUCanvasContext;
  presentPasses: () => number;
  loseDevice: () => void;
  destroyDevice: ReturnType<typeof vi.fn>;
} {
  let passes = 0;
  const destroyDevice = vi.fn();
  const queue = {
    onSubmittedWorkDone: () => Promise.resolve(),
    writeBuffer: () => undefined,
    submit: () => undefined,
  };
  const createTexture = () =>
    ({
      createView: () => ({}) as GPUTextureView,
      destroy: () => undefined,
    }) as unknown as GPUTexture;
  const createPipeline = () => ({ getBindGroupLayout: () => ({}) }) as unknown as GPURenderPipeline;
  const createCommandEncoder = (descriptor?: { label?: string }) => {
    const isPresentation = descriptor?.label?.toLowerCase().includes("present") ?? false;
    return {
      beginRenderPass: () => ({
        setPipeline: () => undefined,
        setBindGroup: () => undefined,
        draw: () => {
          if (isPresentation) passes += 1;
        },
        end: () => undefined,
      }),
      finish: () => ({}),
    } as unknown as GPUCommandEncoder;
  };
  let resolveLost: ((info: GPUDeviceLostInfo) => void) | undefined;
  const lost = new Promise<GPUDeviceLostInfo>((resolve) => {
    resolveLost = resolve;
  });
  const device = {
    queue,
    lost,
    createSampler: () => ({}),
    createBuffer: () => ({ destroy: () => undefined }),
    createShaderModule: () => ({}),
    createRenderPipeline: createPipeline,
    createTexture,
    createBindGroup: () => ({}),
    createCommandEncoder,
    importExternalTexture: () => ({}),
    destroy: destroyDevice,
  } as unknown as GPUDevice;
  const context = {
    configure: () => undefined,
    getCurrentTexture: createTexture,
  } as unknown as GPUCanvasContext;
  return {
    device,
    context,
    presentPasses: () => passes,
    loseDevice: () =>
      resolveLost?.({ reason: "unknown", message: "test device loss" } as GPUDeviceLostInfo),
    destroyDevice,
  };
}
