export declare const P1_VISUAL_MODES: readonly string[];
export declare const P1_VISUAL_FIXTURES: readonly string[];
export declare const P2_P3_FPS: readonly number[];
export declare const P2_P3_SCALES: readonly number[];

export declare function assertHeadedValidationSurface(input: {
  headless?: boolean;
  userAgents?: unknown;
  hardwareStatus?: string;
}): void;

export declare function validateCanonicalVisualManifest(manifest: unknown): {
  valid: boolean;
  errors: string[];
};

export declare function buildAcceptancePlan(): {
  policy: string;
  browserRunsStarted: boolean;
  nativeYouTube: { status: string; checks: string[]; source: string };
  p1Visual: {
    status: string;
    modes: readonly string[];
    fixtures: readonly string[];
    canonicalPath: string;
    writeRule: string;
  };
  p2P3: {
    status: string;
    candidateIdentityRequired: boolean;
    resultsMustNotBeInvented: boolean;
    candidates: Array<{ id: string; backend: string; status: string }>;
    matrix: Array<{ fps: number; scale: number; status: string }>;
    metrics: string[];
  };
};
