import type { MangaTile } from "./types";

/** Build overlap tiles in output pixel coordinates and matching source crops. */
export function createMangaTiles(
  sourceWidth: number,
  sourceHeight: number,
  tileSize = 2048,
  overlap = 32,
  outputWidth = sourceWidth,
  outputHeight = sourceHeight,
): MangaTile[] {
  assertDimension(sourceWidth, "sourceWidth");
  assertDimension(sourceHeight, "sourceHeight");
  assertDimension(outputWidth, "outputWidth");
  assertDimension(outputHeight, "outputHeight");
  if (!Number.isInteger(tileSize) || tileSize <= 0)
    throw new RangeError("tileSize must be positive");
  if (!Number.isInteger(overlap) || overlap < 0 || overlap * 2 >= tileSize) {
    throw new RangeError("overlap must be less than half of tileSize");
  }

  const scaleX = sourceWidth / outputWidth;
  const scaleY = sourceHeight / outputHeight;
  const stride = tileSize - overlap * 2;
  const tiles: MangaTile[] = [];
  for (let y = 0; y < outputHeight; y += stride) {
    for (let x = 0; x < outputWidth; x += stride) {
      const width = Math.min(tileSize, outputWidth - x);
      const height = Math.min(tileSize, outputHeight - y);
      const sourceX = Math.max(0, Math.floor(x * scaleX));
      const sourceY = Math.max(0, Math.floor(y * scaleY));
      const sourceRight = Math.min(sourceWidth, Math.ceil((x + width) * scaleX));
      const sourceBottom = Math.min(sourceHeight, Math.ceil((y + height) * scaleY));
      tiles.push({
        x,
        y,
        width,
        height,
        sourceX,
        sourceY,
        sourceWidth: Math.max(1, sourceRight - sourceX),
        sourceHeight: Math.max(1, sourceBottom - sourceY),
      });
    }
  }
  return tiles;
}

function assertDimension(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${name} must be positive`);
}
