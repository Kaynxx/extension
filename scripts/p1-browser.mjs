import { chromium } from "@playwright/test";

/**
 * Launch configuration shared by the physical-GPU P1 browser surfaces.
 * Headless Chromium is enforced so runners cannot open a desktop window.
 */
export async function launchP1Browser({ chromeExecutable, headless = true }) {
  if (headless !== true) {
    throw new Error(
      "Bu çalışma alanında kullanıcı talimatı gereği headed/desktop testleri kapalıdır.",
    );
  }
  return chromium.launch({
    executablePath: chromeExecutable,
    headless: true,
    args: [
      "--enable-unsafe-webgpu",
      "--enable-features=Vulkan",
      "--use-angle=vulkan",
      "--ignore-gpu-blocklist",
    ],
  });
}
