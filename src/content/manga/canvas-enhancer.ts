import { createMangaTiles } from "./tiling";

export interface CanvasEnhancementOptions {
  readonly tileSize?: number;
  readonly overlap?: number;
  readonly maxOutputDimension?: number;
}

/**
 * Local, non-generative baseline. It uses a tiled 2D canvas so very large
 * pages do not require one oversized intermediate texture. Text and borders
 * are copied with high-quality interpolation; no sharpening is applied.
 */
export function enhanceMangaToCanvas(
  source: CanvasImageSource,
  canvas: HTMLCanvasElement,
  sourceWidth: number,
  sourceHeight: number,
  options: CanvasEnhancementOptions = {},
): void {
  const maxDimension = options.maxOutputDimension ?? 4096;
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const outputWidth = Math.max(1, Math.round(sourceWidth * scale));
  const outputHeight = Math.max(1, Math.round(sourceHeight * scale));
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Manga canvas 2D context is unavailable");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  for (const tile of createMangaTiles(
    sourceWidth,
    sourceHeight,
    options.tileSize,
    options.overlap,
    outputWidth,
    outputHeight,
  )) {
    context.drawImage(
      source,
      tile.sourceX,
      tile.sourceY,
      tile.sourceWidth,
      tile.sourceHeight,
      tile.x,
      tile.y,
      tile.width,
      tile.height,
    );
  }
}
