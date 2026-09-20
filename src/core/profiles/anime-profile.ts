import type { QualityLevel } from "../contracts";

export interface AnimeQualityProfile {
  readonly id: QualityLevel;
  readonly label: string;
  readonly passCount: 1 | 2;
  readonly edgeStrength: number;
  readonly lineStrength: number;
  readonly generative: false;
}

/**
 * Both levels are fidelity-first. High adds a bounded line-restoration pass;
 * neither level invents texture or relies on learned/generative weights.
 */
export const ANIME_PROFILE_LEVELS: Readonly<Record<QualityLevel, AnimeQualityProfile>> =
  Object.freeze({
    low: Object.freeze({
      id: "low",
      label: "Anime Edge Aware",
      passCount: 1,
      edgeStrength: 0.1,
      lineStrength: 0,
      generative: false,
    }),
    high: Object.freeze({
      id: "high",
      label: "Anime Line Restore",
      passCount: 2,
      edgeStrength: 0.12,
      lineStrength: 0.18,
      generative: false,
    }),
  });

export function getAnimePassCount(level: QualityLevel): 1 | 2 {
  return ANIME_PROFILE_LEVELS[level].passCount;
}
