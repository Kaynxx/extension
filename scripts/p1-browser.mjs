import { chromium } from "@playwright/test";

/**
 * Launch configuration shared by the physical-GPU P1 browser surfaces.
 * Canonical acceptance uses headed Chromium. Headless surfaces are diagnostic
 * only and must never write canonical evidence.
 */
export async function launchP1Browser({ chromeExecutable, headless = false }) {
  if (headless !== false) {
    throw new Error(
      "Canonical P1 kanıtı için headed Chromium zorunludur; headless yüzey geçersizdir.",
    );
  }
  return chromium.launch({
    executablePath: chromeExecutable,
    headless: false,
    args: [
      "--enable-unsafe-webgpu",
      "--enable-features=Vulkan",
      "--use-angle=vulkan",
      "--ignore-gpu-blocklist",
    ],
  });
}
