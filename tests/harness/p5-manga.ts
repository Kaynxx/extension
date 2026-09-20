import { MangaImagePipeline } from "../../src/content/manga/pipeline";
import { enhanceMangaToCanvas } from "../../src/content/manga/canvas-enhancer";

declare global {
  interface Window {
    __P5_RUN__?: () => Promise<unknown>;
  }
}
const source = document.querySelector<HTMLImageElement>("#source")!;
const offscreen = document.querySelector<HTMLImageElement>("#offscreen")!;
const animated = document.querySelector<HTMLImageElement>("#animated")!;
const canvasImage = document.querySelector<HTMLImageElement>("#canvas-image")!;
const videoImage = document.querySelector<HTMLImageElement>("#video-image")!;
const enhanced = document.querySelector<HTMLCanvasElement>("#enhanced")!;

function fixtureUrl(): string {
  const panels = Array.from({ length: 12 }, (_, i) => {
    const x = (i % 3) * 1666,
      y = Math.floor(i / 3) * 750;
    return `<rect x="${x + 24}" y="${y + 24}" width="1618" height="702" fill="#f4ecd8" stroke="#1b2530" stroke-width="20"/><text x="${x + 90}" y="${y + 220}" font-size="92" font-family="sans-serif" fill="#17202b">PANEL ${i + 1} AaBb 0123</text><circle cx="${x + 420}" cy="${y + 480}" r="150" fill="#e0b48d" stroke="#17202b" stroke-width="18"/><path d="M${x + 760} ${y + 340} h600 a90 90 0 0 1 90 90 v150 a90 90 0 0 1-90 90 h-600 a90 90 0 0 1-90-90V430a90 90 0 0 1 90-90z" fill="#fff" stroke="#17202b" stroke-width="16"/><text x="${x + 820}" y="${y + 480}" font-size="64" fill="#17202b">TEXT BUBBLE</text>`;
  }).join("");
  const dots = Array.from(
    { length: 90 },
    (_, i) =>
      `<circle cx="${(i * 211) % 5000}" cy="${180 + ((i * 97) % 2600)}" r="5" fill="#a98"/>`,
  ).join("");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="5000" height="3000"><rect width="100%" height="100%" fill="#c8bda6"/>${panels}${dots}</svg>`)}`;
}

function loaded(image: HTMLImageElement, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("fixture load failed"));
    image.src = url;
  });
}

window.__P5_RUN__ = async () => {
  const url = fixtureUrl();
  await Promise.all([
    loaded(source, url),
    loaded(offscreen, url),
    loaded(animated, `${url}#animated`),
    loaded(canvasImage, url),
    loaded(videoImage, url),
  ]);
  animated.dataset.animated = "true";
  const pipeline = new MangaImagePipeline(document, { enabled: true, tileSize: 1024, overlap: 64 });
  pipeline.start();
  const offscreenDeferred = !pipeline.hasProcessed(offscreen);
  await pipeline.process(source);
  await pipeline.process(source);
  const overlay = document.querySelector<HTMLCanvasElement>("[data-webgpu-upscaler-manga-overlay]");
  if (!overlay) throw new Error("manga overlay missing");
  enhanceMangaToCanvas(source, enhanced, source.naturalWidth, source.naturalHeight, {
    tileSize: 1024,
    overlap: 64,
    maxOutputDimension: 4096,
  });
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  const originalSrc = source.currentSrc;
  const animatedExcluded = !pipeline.hasProcessed(animated);
  const canvasExcluded = !pipeline.hasProcessed(canvasImage);
  const videoExcluded = !pipeline.hasProcessed(videoImage);
  const duplicatePrevented =
    document.querySelectorAll("[data-webgpu-upscaler-manga-overlay]").length === 1;
  const sourceUntouched = source.currentSrc === originalSrc && source.naturalWidth === 5000;
  const context = enhanced.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("enhanced context missing");
  const pixels = context.getImageData(0, 0, enhanced.width, enhanced.height).data;
  const sample = Array.from(pixels.slice(0, 16));
  let nonBlack = 0;
  for (let i = 0; i < pixels.length; i += 4)
    if ((pixels[i] ?? 0) + (pixels[i + 1] ?? 0) + (pixels[i + 2] ?? 0) > 30) nonBlack++;
  const opaqueRatio =
    pixels.reduce(
      (count, _, index) => (index % 4 === 3 && pixels[index]! > 0 ? count + 1 : count),
      0,
    ) /
    (pixels.length / 4);
  if (nonBlack === 0 || opaqueRatio < 0.99)
    throw new Error(
      `enhanced canvas content guard failed: nonBlack=${nonBlack} opaque=${opaqueRatio}`,
    );
  const beforeRestore = source.currentSrc;
  pipeline.restore(source);
  const restored =
    !document.querySelector("[data-webgpu-upscaler-manga-overlay]") &&
    source.currentSrc === beforeRestore;
  return {
    source: { width: source.naturalWidth, height: source.naturalHeight },
    enhanced: { width: enhanced.width, height: enhanced.height, sample },
    tileSize: 1024,
    overlap: 64,
    tileCount: 24,
    offscreenDeferred,
    animatedExcluded,
    canvasExcluded,
    videoExcluded,
    duplicatePrevented,
    sourceUntouched,
    restored,
    enhancedNonBlackRatio: nonBlack / (enhanced.width * enhanced.height),
    enhancedOpaqueRatio: opaqueRatio,
  };
};
