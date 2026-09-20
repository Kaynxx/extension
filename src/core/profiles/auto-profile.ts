import type { ProcessingProfile } from "../contracts";
import type { ContentProfile } from "../settings";

/** The non-safe profiles that the bounded auto selector may choose. */
export type AutoDetectedProfile = Exclude<ProcessingProfile, "safe">;

export interface ContentMetadata {
  readonly width?: number;
  readonly height?: number;
  readonly frameRate?: number;
  readonly durationSeconds?: number;
}

/**
 * A deliberately small summary of a frame.  The production path must provide
 * these values from a bounded, local sampler; it must not read pixels back
 * from the normal WebGPU render path. Values are normalized to [0, 1].
 */
export interface SpatialFrameFeatures {
  readonly edgeDensity: number;
  readonly flatRegionRatio: number;
  readonly colorfulness: number;
  readonly textLikeRatio: number;
}

export interface ContentEvidence {
  readonly metadata?: ContentMetadata;
  readonly spatial?: SpatialFrameFeatures;
}

export interface ProfileScores {
  readonly anime: number;
  readonly "live-action": number;
  readonly "screen-3d": number;
}

export interface AutoClassification {
  readonly profile: ProcessingProfile;
  readonly confidence: number;
  readonly scores: ProfileScores;
}

export interface AutoProfileDecision extends AutoClassification {
  readonly changed: boolean;
  readonly stableSamples: number;
}

const CONFIDENCE_THRESHOLD = 0.62;
const REQUIRED_STABLE_SAMPLES = 3;

/**
 * Classifies only when evidence is sufficiently strong. Unknown or incomplete
 * evidence intentionally resolves to safe; this is a routing hint, not a
 * content-understanding or generative model.
 */
export function classifyContent(evidence: ContentEvidence): AutoClassification {
  const spatial = evidence.spatial;
  if (!spatial) return unknownClassification();

  const edge = bounded(spatial.edgeDensity);
  const flat = bounded(spatial.flatRegionRatio);
  const color = bounded(spatial.colorfulness);
  const text = bounded(spatial.textLikeRatio);
  if (edge + flat + color + text < 0.2) return unknownClassification();
  const metadata = evidence.metadata;

  // Flat, colourful regions with a strong line signal are common in 2D art.
  const anime = weightedScore([
    [flat, 0.34],
    [color, 0.22],
    [edge, 0.28],
    [1 - text, 0.16],
  ]);
  // Fine texture and low flat-region occupancy are safer live-action signals.
  const liveAction = weightedScore([
    [1 - flat, 0.4],
    [0.55 + 0.45 * (1 - color), 0.18],
    [edge, 0.24],
    [1 - text, 0.18],
  ]);
  // Text/UI-like edges and broad flat regions are characteristic of screens.
  const screen3d = weightedScore([
    [text, 0.46],
    [flat, 0.25],
    [edge, 0.19],
    [1 - color, 0.1],
  ]);

  // Metadata only breaks ties; it never creates a confident classification.
  const aspect = metadata?.width && metadata.height ? metadata.width / metadata.height : 0;
  const metadataNudge = aspect >= 1.2 && aspect <= 2.4 ? 0.02 : 0;
  const scores: ProfileScores = {
    anime: anime + metadataNudge,
    "live-action": liveAction,
    "screen-3d": screen3d + metadataNudge * 0.5,
  };
  const ranked = (Object.entries(scores) as Array<[AutoDetectedProfile, number]>).sort(
    ([, left], [, right]) => right - left,
  );
  const first = ranked[0];
  const second = ranked[1];
  if (!first || !second) return unknownClassification();
  const confidence = clamp(first[1] - second[1] + first[1] * 0.35);
  return {
    profile: confidence >= CONFIDENCE_THRESHOLD ? first[0] : "safe",
    confidence,
    scores,
  };
}

/**
 * Debounces profile changes and applies hysteresis. Manual profiles never
 * enter this class, so a caller can guarantee that manual override wins.
 */
export class AutoProfileSelector {
  private selected: ProcessingProfile = "safe";
  private candidate: ProcessingProfile = "safe";
  private stableSamples = 0;

  observe(evidence: ContentEvidence): AutoProfileDecision {
    const classification = classifyContent(evidence);
    const candidate =
      classification.confidence >= CONFIDENCE_THRESHOLD ? classification.profile : "safe";
    if (candidate === this.candidate) this.stableSamples += 1;
    else {
      this.candidate = candidate;
      this.stableSamples = 1;
    }

    const canSwitch = this.stableSamples >= REQUIRED_STABLE_SAMPLES;
    const changed = canSwitch && candidate !== this.selected;
    if (changed) this.selected = candidate;
    return {
      ...classification,
      profile: this.selected,
      changed,
      stableSamples: this.stableSamples,
    };
  }

  reset(): void {
    this.selected = "safe";
    this.candidate = "safe";
    this.stableSamples = 0;
  }

  current(): ProcessingProfile {
    return this.selected;
  }
}

/** Manual selections are authoritative and never get replaced by auto mode. */
export function resolveContentProfile(
  requested: ContentProfile,
  selector: AutoProfileSelector,
): ProcessingProfile {
  return requested === "auto" ? selector.current() : requested;
}

export function unknownClassification(): AutoClassification {
  return {
    profile: "safe",
    confidence: 0,
    scores: { anime: 0, "live-action": 0, "screen-3d": 0 },
  };
}

function bounded(value: number): number {
  return Number.isFinite(value) ? clamp(value) : 0;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function weightedScore(values: ReadonlyArray<readonly [number, number]>): number {
  return values.reduce((sum, [value, weight]) => sum + clamp(value) * weight, 0);
}
