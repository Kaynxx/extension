import {
  SETTINGS_KEY,
  normalizeSettings,
  readSettings,
  type UpscalerSettings,
} from "../../core/settings";
import { UpscalerController } from "./upscaler-controller";
import { VideoLocator } from "./video-locator";

let settings: UpscalerSettings;
let controller: UpscalerController | undefined;
let controllerVideo: HTMLVideoElement | null = null;
let controllerStarting = false;
let applyGeneration = 0;

async function applyVideo(video: HTMLVideoElement | null): Promise<void> {
  // A quality switch can keep the same HTMLVideoElement and only change its
  // intrinsic source size. Keep the existing overlay/backend alive while
  // prompting the controller to re-read its source dimensions.
  if (video !== null && controller !== undefined && controllerVideo === video) {
    if (!controllerStarting) {
      void controller.update(settings).catch((error: unknown) => {
        console.warn("[WebGPU Video Upscaler] Kaynak boyutu uygulanamadı", error);
        controller?.stop();
        controller = undefined;
        controllerVideo = null;
      });
    }
    return;
  }

  const generation = ++applyGeneration;
  controller?.stop();
  controller = undefined;
  controllerVideo = null;
  controllerStarting = false;
  if (!video || !settings.enabled) return;

  const nextController = new UpscalerController(video, settings);
  controller = nextController;
  controllerVideo = video;
  controllerStarting = true;
  try {
    await nextController.start();
    if (generation !== applyGeneration || controller !== nextController) {
      nextController.stop();
    } else {
      controllerStarting = false;
    }
  } catch (error) {
    console.warn("[WebGPU Video Upscaler] Başlatılamadı", error);
    nextController.stop();
    if (controller === nextController) {
      controller = undefined;
      controllerVideo = null;
      controllerStarting = false;
    }
  }
}

async function main(): Promise<void> {
  settings = await readSettings();
  const locator = new VideoLocator();
  const unsubscribe = locator.subscribe((video) => void applyVideo(video));
  locator.start();

  const handleSettingsChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local" || !changes[SETTINGS_KEY]) return;
    settings = normalizeSettings(changes[SETTINGS_KEY].newValue);
    if (controller) {
      void controller.update(settings).catch((error: unknown) => {
        console.warn("[WebGPU Video Upscaler] Ayarlar uygulanamadı", error);
        controller?.stop();
        controller = undefined;
        controllerVideo = null;
        controllerStarting = false;
      });
    } else if (settings.enabled) {
      const video = locator.current();
      if (video) void applyVideo(video);
    }
  };
  chrome.storage.onChanged.addListener(handleSettingsChange);

  window.addEventListener(
    "pagehide",
    () => {
      applyGeneration += 1;
      controller?.stop();
      controller = undefined;
      controllerVideo = null;
      controllerStarting = false;
      unsubscribe();
      locator.stop();
      chrome.storage.onChanged.removeListener(handleSettingsChange);
    },
    { once: true },
  );
}

void main().catch((error) => {
  console.error("[WebGPU Video Upscaler] Content script hatası", error);
});
