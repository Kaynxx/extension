import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  readSettings,
  writeSettings,
  type UpscalerSettings,
} from "../core/settings";
import "./popup.css";

const elements = {
  enabled: required<HTMLInputElement>("enabled"),
  mangaEnabled: required<HTMLInputElement>("manga-enabled"),
  profile: required<HTMLSelectElement>("profile"),
  quality: required<HTMLSelectElement>("quality"),
  target: required<HTMLSelectElement>("target"),
  comparison: required<HTMLInputElement>("comparison"),
  comparisonValue: required<HTMLOutputElement>("compare-value"),
  showHud: required<HTMLInputElement>("show-hud"),
  statusDot: required<HTMLElement>("status-dot"),
  statusText: required<HTMLElement>("status-text"),
};

let settings: UpscalerSettings = { ...DEFAULT_SETTINGS };
let saveTimer: number | undefined;

async function initialize(): Promise<void> {
  settings = await readSettings();
  render();
  bindEvents();
}

function render(): void {
  elements.enabled.checked = settings.enabled;
  elements.mangaEnabled.checked = settings.mangaEnabled;
  elements.profile.value = settings.profile;
  elements.quality.value = settings.quality;
  elements.target.value = settings.target;
  elements.comparison.value = String(settings.comparison);
  elements.comparisonValue.value = `%${settings.comparison}`;
  elements.showHud.checked = settings.showHud;
  elements.statusDot.classList.toggle("active", settings.enabled);
  elements.statusText.textContent = settings.enabled
    ? "YouTube'da etkin"
    : "Kapalı — orijinal video gösteriliyor";
}

function bindEvents(): void {
  const update = () => {
    settings = normalizeSettings({
      enabled: elements.enabled.checked,
      mangaEnabled: elements.mangaEnabled.checked,
      profile: elements.profile.value,
      quality: elements.quality.value,
      target: elements.target.value,
      comparison: Number(elements.comparison.value),
      showHud: elements.showHud.checked,
    });
    render();
    scheduleSave();
  };

  elements.enabled.addEventListener("change", update);
  elements.mangaEnabled.addEventListener("change", update);
  elements.profile.addEventListener("change", update);
  elements.quality.addEventListener("change", update);
  elements.target.addEventListener("change", update);
  elements.comparison.addEventListener("input", update);
  elements.showHud.addEventListener("change", update);
}

function scheduleSave(): void {
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void writeSettings(settings), 40);
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Eksik popup elementi: ${id}`);
  return element as T;
}

void initialize();
