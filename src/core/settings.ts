export type ContentProfile = "safe" | "anime" | "live-action" | "screen-3d" | "auto";

export type QualityPreference = "auto" | "low" | "high";
export type TargetPreference = "display" | "4k" | "2x" | "3x";

export interface UpscalerSettings {
  enabled: boolean;
  mangaEnabled: boolean;
  profile: ContentProfile;
  quality: QualityPreference;
  target: TargetPreference;
  comparison: number;
  showHud: boolean;
}

export const SETTINGS_KEY = "upscalerSettings";

export const DEFAULT_SETTINGS: Readonly<UpscalerSettings> = Object.freeze({
  enabled: false,
  mangaEnabled: false,
  profile: "anime",
  quality: "auto",
  target: "2x",
  comparison: 100,
  showHud: false,
});

const profiles = new Set<ContentProfile>(["safe", "anime", "live-action", "screen-3d", "auto"]);
const qualities = new Set<QualityPreference>(["auto", "low", "high"]);
const targets = new Set<TargetPreference>(["display", "4k", "2x", "3x"]);

export function normalizeSettings(value: unknown): UpscalerSettings {
  const input = isRecord(value) ? value : {};

  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : DEFAULT_SETTINGS.enabled,
    mangaEnabled:
      typeof input.mangaEnabled === "boolean" ? input.mangaEnabled : DEFAULT_SETTINGS.mangaEnabled,
    profile: profiles.has(input.profile as ContentProfile)
      ? (input.profile as ContentProfile)
      : DEFAULT_SETTINGS.profile,
    quality: qualities.has(input.quality as QualityPreference)
      ? (input.quality as QualityPreference)
      : DEFAULT_SETTINGS.quality,
    target: targets.has(input.target as TargetPreference)
      ? (input.target as TargetPreference)
      : DEFAULT_SETTINGS.target,
    comparison: clampNumber(input.comparison, 0, 100, DEFAULT_SETTINGS.comparison),
    showHud: typeof input.showHud === "boolean" ? input.showHud : DEFAULT_SETTINGS.showHud,
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function readSettings(): Promise<UpscalerSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(stored[SETTINGS_KEY]);
}

export async function writeSettings(settings: UpscalerSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: normalizeSettings(settings) });
}
