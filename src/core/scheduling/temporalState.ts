import type { VideoFrameMetadata } from "./frameScheduler";

export type TemporalResetReason =
  "scene-cut" | "seek" | "quality-change" | "source-change" | "resize" | "manual";

export interface TemporalResetEvent {
  readonly reason: TemporalResetReason;
  readonly generation: number;
}

/**
 * Safe reset-only temporal boundary. It deliberately stores no frame history;
 * a future temporal model can subscribe without pretending that stabilization
 * already exists in the MVP.
 */
export class TemporalStateBoundary {
  private lastMediaTime: number | undefined;
  private lastPresentedFrames: number | undefined;
  private generationValue = 0;
  private readonly resetListeners = new Set<(event: TemporalResetEvent) => void>();

  observe(metadata: VideoFrameMetadata): TemporalResetReason | undefined {
    const mediaTime = metadata.mediaTime;
    const presentedFrames = metadata.presentedFrames;
    let reason: TemporalResetReason | undefined;
    if (
      this.lastMediaTime !== undefined &&
      Number.isFinite(mediaTime) &&
      mediaTime + 0.08 < this.lastMediaTime
    ) {
      reason = "seek";
    } else if (
      this.lastPresentedFrames !== undefined &&
      Number.isFinite(presentedFrames) &&
      presentedFrames < this.lastPresentedFrames
    ) {
      reason = "seek";
    }
    this.lastMediaTime = Number.isFinite(mediaTime) ? mediaTime : this.lastMediaTime;
    this.lastPresentedFrames = Number.isFinite(presentedFrames)
      ? presentedFrames
      : this.lastPresentedFrames;
    return reason;
  }

  reset(reason: TemporalResetReason): TemporalResetEvent {
    this.lastMediaTime = undefined;
    this.lastPresentedFrames = undefined;
    const event = { reason, generation: ++this.generationValue };
    for (const listener of this.resetListeners) listener(event);
    return event;
  }

  generation(): number {
    return this.generationValue;
  }

  onReset(listener: (event: TemporalResetEvent) => void): () => void {
    this.resetListeners.add(listener);
    return () => this.resetListeners.delete(listener);
  }
}

/** Bounded spatial difference suitable for a low-frequency scene-cut signal. */
export function isSceneCut(
  previous: readonly number[],
  current: readonly number[],
  threshold = 0.32,
): boolean {
  if (previous.length === 0 || previous.length !== current.length) return false;
  let difference = 0;
  for (let index = 0; index < previous.length; index += 1) {
    difference += Math.abs((previous[index] ?? 0) - (current[index] ?? 0));
  }
  return difference / previous.length >= Math.max(0, threshold);
}
