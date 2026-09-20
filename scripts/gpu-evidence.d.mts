export interface GpuEvidence {
  hardwareStatus: "hardware" | "software" | "unknown";
  softwareRendererDetected: boolean;
  softwareReasons: string[];
  devices: unknown[];
  renderer: {
    displayType: string;
    glRenderer: string;
    glVendor: string;
    glVersion: string;
    glImplementationParts: string;
    hardwareSupportsVulkan: boolean | null;
  };
  featureStatus: {
    webgpu: string;
    vulkan: string;
    gpuCompositing: string;
    videoDecode: string;
  };
  commandLine: string;
}

export interface CanonicalAcceptanceEvidence {
  headless: boolean;
  userAgents: string[];
  gpuEvidence: GpuEvidence;
  rawTimingSamples: number[][];
  complete: boolean;
}

export function summarizeGpuSystemInfo(systemInfo: unknown): GpuEvidence;
export function assertHardwareGpu(gpuEvidence: GpuEvidence): void;
export function assertCanonicalAcceptanceEvidence(evidence: CanonicalAcceptanceEvidence): void;
