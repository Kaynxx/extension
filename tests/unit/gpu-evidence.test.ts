import { describe, expect, it } from "vitest";

import {
  assertCanonicalAcceptanceEvidence,
  assertHardwareGpu,
  summarizeGpuSystemInfo,
} from "../../scripts/gpu-evidence.mjs";

function hardwareEvidence() {
  return summarizeGpuSystemInfo({
    gpu: {
      devices: [{ vendorString: "NVIDIA", deviceString: "GeForce RTX 5070" }],
      auxAttributes: {
        displayType: "ANGLE_VULKAN",
        glRenderer: "ANGLE (NVIDIA, Vulkan GeForce RTX 5070)",
        glVendor: "Google Inc. (NVIDIA)",
        hardwareSupportsVulkan: true,
      },
      featureStatus: { webgpu: "enabled", vulkan: "enabled_on" },
    },
  });
}

describe("benchmark GPU evidence gate", () => {
  it("accepts a browser-level Vulkan hardware renderer", () => {
    const evidence = hardwareEvidence();

    expect(evidence.hardwareStatus).toBe("hardware");
    expect(() => assertHardwareGpu(evidence)).not.toThrow();
  });

  it("rejects SwiftShader even when WebGPU is exposed", () => {
    const evidence = summarizeGpuSystemInfo({
      gpu: {
        devices: [
          {
            vendorString: "Google Inc. (Google)",
            deviceString: "ANGLE (Google, SwiftShader Device)",
            driverVendor: "SwANGLE",
          },
        ],
        auxAttributes: {
          displayType: "ANGLE_SWIFTSHADER",
          glRenderer: "ANGLE (Google, SwiftShader Device)",
        },
        featureStatus: { webgpu: "unavailable_software", vulkan: "disabled_off" },
      },
    });

    expect(evidence.hardwareStatus).toBe("software");
    expect(() => assertHardwareGpu(evidence)).toThrow(/yazılım GPU renderer/i);
  });

  it("does not classify disabled software video encode as a software renderer", () => {
    const evidence = summarizeGpuSystemInfo({
      gpu: {
        devices: [{ driverVendor: "NVIDIA" }],
        auxAttributes: {
          displayType: "ANGLE_VULKAN",
          glRenderer: "ANGLE (NVIDIA, Vulkan GeForce RTX 5070)",
        },
        featureStatus: {
          webgpu: "enabled",
          vulkan: "enabled_on",
          video_encode: "disabled_software",
        },
      },
    });

    expect(evidence.softwareRendererDetected).toBe(false);
    expect(evidence.hardwareStatus).toBe("hardware");
  });
});

describe("canonical P1 acceptance evidence gate", () => {
  const validEvidence = () => ({
    headless: false,
    userAgents: [
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36",
    ],
    gpuEvidence: hardwareEvidence(),
    rawTimingSamples: [[8.1, 8.4, 8.2]],
    complete: true,
  });

  it("accepts complete headed physical-GPU evidence with raw samples", () => {
    expect(() => assertCanonicalAcceptanceEvidence(validEvidence())).not.toThrow();
  });

  it("rejects a headless launch flag", () => {
    expect(() => assertCanonicalAcceptanceEvidence({ ...validEvidence(), headless: true })).toThrow(
      /headed Chromium/i,
    );
  });

  it("rejects the HeadlessChrome user-agent even with a hardware renderer", () => {
    expect(() =>
      assertCanonicalAcceptanceEvidence({
        ...validEvidence(),
        userAgents: ["Mozilla/5.0 HeadlessChrome/151.0.0.0"],
      }),
    ).toThrow(/HeadlessChrome/i);
  });

  it("rejects a software renderer", () => {
    const softwareEvidence = summarizeGpuSystemInfo({
      gpu: {
        devices: [{ deviceString: "ANGLE (Google, SwiftShader Device)" }],
        auxAttributes: { glRenderer: "ANGLE (Google, SwiftShader Device)" },
        featureStatus: { webgpu: "enabled", vulkan: "enabled_on" },
      },
    });
    expect(() =>
      assertCanonicalAcceptanceEvidence({
        ...validEvidence(),
        gpuEvidence: softwareEvidence,
      }),
    ).toThrow(/yazılım GPU renderer/i);
  });

  it("rejects absent or invalid raw timing samples", () => {
    expect(() =>
      assertCanonicalAcceptanceEvidence({ ...validEvidence(), rawTimingSamples: [] }),
    ).toThrow(/ham zamanlama/i);
    expect(() =>
      assertCanonicalAcceptanceEvidence({ ...validEvidence(), rawTimingSamples: [[]] }),
    ).toThrow(/ham zamanlama/i);
  });

  it("rejects an incomplete run", () => {
    expect(() =>
      assertCanonicalAcceptanceEvidence({ ...validEvidence(), complete: false }),
    ).toThrow(/tamamlanmadı/i);
  });
});
