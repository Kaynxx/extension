import type { QualityLevel } from "../contracts";

/**
 * @deprecated Production GPU code uses the canonical contracts in
 * `src/core/contracts.ts`. Keep this module as a compatibility surface only.
 */
export type {
  BackendContext as BackendConfiguration,
  FrameSize,
  ProcessingProfile,
  PreparedFrame,
  QualityLevel,
  RenderSource,
  RenderStats,
  UpscalerBackend,
} from "../contracts";

export type RuntimeQuality = QualityLevel;

export interface CapabilityResult {
  supported: boolean;
  adapterInfo?: string;
  reason?: string;
  maxTextureDimension2D?: number;
}
