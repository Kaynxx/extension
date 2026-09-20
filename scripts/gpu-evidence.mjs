const SOFTWARE_RENDERER_PATTERN = /swiftshader|swangle|llvmpipe|lavapipe|swrast|software renderer/i;

/**
 * Reduce Chrome's browser-level SystemInfo response to the fields that are
 * useful for a reproducible WebGPU benchmark. Do not infer hardware from
 * navigator.gpu or GPUAdapterInfo alone: Chrome may expose WebGPU while using
 * a software renderer.
 */
export function summarizeGpuSystemInfo(systemInfo) {
  const gpu = systemInfo?.gpu ?? {};
  const devices = Array.isArray(gpu.devices) ? gpu.devices : [];
  const auxAttributes = gpu.auxAttributes ?? {};
  const featureStatus = gpu.featureStatus ?? {};
  const rendererText = [
    auxAttributes.displayType,
    auxAttributes.glRenderer,
    auxAttributes.glVendor,
    auxAttributes.glVersion,
    auxAttributes.glImplementationParts,
    ...devices.flatMap((device) => [
      device?.vendorString,
      device?.deviceString,
      device?.driverVendor,
    ]),
  ]
    .filter((value) => typeof value === "string" && value.length > 0)
    .join(" | ");
  const softwareMatches = rendererText.match(SOFTWARE_RENDERER_PATTERN);
  const webgpuStatus = String(featureStatus.webgpu ?? "unknown");
  const vulkanStatus = String(featureStatus.vulkan ?? "unknown");
  const webgpuEnabled = /^enabled(?:_|$)/i.test(webgpuStatus);
  const vulkanEnabled = vulkanStatus === "unknown" || /^enabled(?:_|$)/i.test(vulkanStatus);
  const hasRenderer = rendererText.length > 0;
  const hasDevice = devices.length > 0;

  let hardwareStatus = "unknown";
  if (softwareMatches) {
    hardwareStatus = "software";
  } else if (webgpuEnabled && vulkanEnabled && hasRenderer && hasDevice) {
    hardwareStatus = "hardware";
  }

  return {
    hardwareStatus,
    softwareRendererDetected: Boolean(softwareMatches),
    softwareReasons: softwareMatches ? [softwareMatches[0]] : [],
    devices,
    renderer: {
      displayType: String(auxAttributes.displayType ?? "unknown"),
      glRenderer: String(auxAttributes.glRenderer ?? "unknown"),
      glVendor: String(auxAttributes.glVendor ?? "unknown"),
      glVersion: String(auxAttributes.glVersion ?? "unknown"),
      glImplementationParts: String(auxAttributes.glImplementationParts ?? "unknown"),
      hardwareSupportsVulkan: auxAttributes.hardwareSupportsVulkan ?? null,
    },
    featureStatus: {
      webgpu: webgpuStatus,
      vulkan: vulkanStatus,
      gpuCompositing: String(featureStatus.gpu_compositing ?? "unknown"),
      videoDecode: String(featureStatus.video_decode ?? "unknown"),
    },
    commandLine: String(gpu.commandLine ?? ""),
  };
}

/**
 * Throw unless the benchmark has a browser-level hardware WebGPU signal.
 * The caller may run without this gate for diagnostics, but must not publish
 * that run as hardware evidence.
 */
export function assertHardwareGpu(gpuEvidence) {
  if (gpuEvidence?.softwareRendererDetected) {
    throw new Error(
      `P1 hardware gate reddetti: yazılım GPU renderer bulundu (${gpuEvidence.softwareReasons.join(", ")}).`,
    );
  }
  if (gpuEvidence?.hardwareStatus !== "hardware") {
    throw new Error(
      `P1 hardware gate reddetti: GPU yolu doğrulanamadı (durum: ${gpuEvidence?.hardwareStatus ?? "unknown"}).`,
    );
  }
  if (!/^enabled(?:_|$)/i.test(String(gpuEvidence.featureStatus?.webgpu ?? ""))) {
    throw new Error(
      `P1 hardware gate reddetti: WebGPU durumu ${gpuEvidence?.featureStatus?.webgpu ?? "unknown"}.`,
    );
  }
  const vulkanStatus = String(gpuEvidence.featureStatus?.vulkan ?? "unknown");
  if (vulkanStatus !== "unknown" && !/^enabled(?:_|$)/i.test(vulkanStatus)) {
    throw new Error(`P1 hardware gate reddetti: Vulkan durumu ${vulkanStatus}.`);
  }
}

/**
 * Last line of defence before a canonical P1 acceptance manifest is written.
 * Keep this independent from the runner so an accidental launch/configuration
 * regression cannot turn a diagnostic run into acceptance evidence.
 */
export function assertCanonicalAcceptanceEvidence({
  headless,
  userAgents,
  gpuEvidence,
  rawTimingSamples,
  complete,
}) {
  if (headless !== true) {
    throw new Error("P1 canonical evidence reddedildi: headless Chromium zorunludur.");
  }

  if (!Array.isArray(userAgents) || userAgents.length === 0) {
    throw new Error("P1 canonical evidence reddedildi: browser user-agent kanıtı eksik.");
  }
  assertHardwareGpu(gpuEvidence);

  if (!Array.isArray(rawTimingSamples) || rawTimingSamples.length === 0) {
    throw new Error("P1 canonical evidence reddedildi: ham zamanlama serileri eksik.");
  }
  const invalidSeries = rawTimingSamples.find(
    (series) =>
      !Array.isArray(series) ||
      series.length === 0 ||
      series.some((value) => !Number.isFinite(value) || value < 0),
  );
  if (invalidSeries !== undefined) {
    throw new Error("P1 canonical evidence reddedildi: ham zamanlama serisi geçersiz.");
  }

  if (complete !== true) {
    throw new Error("P1 canonical evidence reddedildi: koşu tamamlanmadı.");
  }
}
