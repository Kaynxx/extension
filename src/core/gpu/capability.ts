import type { CapabilityResult } from "./types";

export async function probeWebGpu(): Promise<CapabilityResult> {
  if (!("gpu" in navigator) || !navigator.gpu) {
    return { supported: false, reason: "WebGPU bu tarayıcıda kullanılamıyor." };
  }

  try {
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: "high-performance",
    });
    if (!adapter) {
      return { supported: false, reason: "Uygun WebGPU adaptörü bulunamadı." };
    }

    const info = adapter.info;
    const adapterInfo = [info.vendor, info.architecture, info.device].filter(Boolean).join(" ");

    return {
      supported: true,
      adapterInfo: adapterInfo || "WebGPU adaptörü",
    };
  } catch (error) {
    return {
      supported: false,
      reason: error instanceof Error ? error.message : "WebGPU başlatılamadı.",
    };
  }
}

export function isLikelyHdr(video: HTMLVideoElement): boolean {
  if (!("VideoFrame" in globalThis) || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return false;
  }

  try {
    const frame = new VideoFrame(video);
    const color = frame.colorSpace;
    const transfer = color.transfer?.toLowerCase() ?? "";
    const primaries = color.primaries?.toLowerCase() ?? "";
    frame.close();
    return (
      transfer.includes("pq") ||
      transfer.includes("hlg") ||
      transfer.includes("smpte2084") ||
      primaries.includes("bt2020")
    );
  } catch {
    return false;
  }
}
