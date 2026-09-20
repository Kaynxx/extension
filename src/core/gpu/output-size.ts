import type { TargetPreference } from "../settings";
import type { FrameSize } from "./types";

const MAX_4K_WIDTH = 3840;
const MAX_4K_HEIGHT = 2160;

export interface OutputSizeInput {
  source: FrameSize;
  displayCss: FrameSize;
  devicePixelRatio: number;
  target: TargetPreference;
  maxTextureDimension2D: number;
}

export function computeOutputSize(input: OutputSizeInput): FrameSize {
  const source = sanitizeSize(input.source);
  const display = sanitizeSize(input.displayCss);
  const dpr = clamp(input.devicePixelRatio, 1, 4);
  // Invalid adapter limits must fail closed. Math.floor(NaN/Infinity) would
  // otherwise propagate NaN/Infinity into canvas dimensions.
  const textureLimit =
    Number.isFinite(input.maxTextureDimension2D) && input.maxTextureDimension2D > 0
      ? Math.max(1, Math.floor(input.maxTextureDimension2D))
      : 1;

  let desiredScale: number;
  switch (input.target) {
    case "2x":
      desiredScale = 2;
      break;
    case "3x":
      desiredScale = 3;
      break;
    case "4k":
      desiredScale = scaleToFit(source, {
        width: MAX_4K_WIDTH,
        height: MAX_4K_HEIGHT,
      });
      break;
    case "display": {
      const physicalDisplay = {
        width: Math.round(display.width * dpr),
        height: Math.round(display.height * dpr),
      };
      desiredScale = Math.max(1, scaleToFit(source, physicalDisplay));
      break;
    }
  }

  const fourKScale = scaleToFit(source, {
    width: MAX_4K_WIDTH,
    height: MAX_4K_HEIGHT,
  });
  const textureScale = textureLimit / Math.max(source.width, source.height);
  const scale = Math.max(1, Math.min(desiredScale, fourKScale, textureScale));

  return {
    width: Math.max(1, Math.min(textureLimit, Math.round(source.width * scale))),
    height: Math.max(1, Math.min(textureLimit, Math.round(source.height * scale))),
  };
}

function scaleToFit(source: FrameSize, bounds: FrameSize): number {
  return Math.min(bounds.width / source.width, bounds.height / source.height);
}

function sanitizeSize(size: FrameSize): FrameSize {
  return {
    width: Math.max(1, Math.round(size.width)),
    height: Math.max(1, Math.round(size.height)),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
