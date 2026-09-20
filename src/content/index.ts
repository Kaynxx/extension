import "./youtube/index";
import { MangaImagePipeline } from "./manga";
import {
  SETTINGS_KEY,
  normalizeSettings,
  readSettings,
  type UpscalerSettings,
} from "../core/settings";

let mangaPipeline: MangaImagePipeline | undefined;

async function startMangaPipeline(): Promise<void> {
  const settings = await readSettings();
  if (!settings.mangaEnabled) return;
  mangaPipeline = new MangaImagePipeline(document, { enabled: true });
  mangaPipeline.start();
}

void startMangaPipeline();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[SETTINGS_KEY]) return;
  const settings = normalizeSettings(changes[SETTINGS_KEY].newValue) as UpscalerSettings;
  if (settings.mangaEnabled && !mangaPipeline) {
    mangaPipeline = new MangaImagePipeline(document, { enabled: true });
    mangaPipeline.start();
  } else if (!settings.mangaEnabled && mangaPipeline) {
    mangaPipeline.stop();
    mangaPipeline = undefined;
  }
});

window.addEventListener(
  "pagehide",
  () => {
    mangaPipeline?.stop();
    mangaPipeline = undefined;
  },
  { once: true },
);
