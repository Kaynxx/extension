import { computeOutputSize } from "../../src/core/gpu/output-size";

describe("computeOutputSize", () => {
  const base = {
    displayCss: { width: 3840, height: 2160 },
    devicePixelRatio: 1,
    maxTextureDimension2D: 8192,
  };

  it("uses direct x2 for 1080p to 4K", () => {
    expect(
      computeOutputSize({
        ...base,
        source: { width: 1920, height: 1080 },
        target: "4k",
      }),
    ).toEqual({ width: 3840, height: 2160 });
  });

  it("uses direct x3 for 720p to 4K", () => {
    expect(
      computeOutputSize({
        ...base,
        source: { width: 1280, height: 720 },
        target: "4k",
      }),
    ).toEqual({ width: 3840, height: 2160 });
  });

  it("does not exceed the display in display mode", () => {
    expect(
      computeOutputSize({
        source: { width: 1280, height: 720 },
        displayCss: { width: 1920, height: 1080 },
        devicePixelRatio: 1,
        target: "display",
        maxTextureDimension2D: 8192,
      }),
    ).toEqual({ width: 1920, height: 1080 });
  });

  it("honors the GPU texture limit", () => {
    expect(
      computeOutputSize({
        ...base,
        source: { width: 1920, height: 1080 },
        target: "3x",
        maxTextureDimension2D: 2048,
      }),
    ).toEqual({ width: 2048, height: 1152 });
  });

  it("fails closed for invalid GPU texture limits", () => {
    expect(
      computeOutputSize({
        ...base,
        source: { width: 1920, height: 1080 },
        target: "3x",
        maxTextureDimension2D: Number.NaN,
      }),
    ).toEqual({ width: 1, height: 1 });
    expect(
      computeOutputSize({
        ...base,
        source: { width: 1920, height: 1080 },
        target: "3x",
        maxTextureDimension2D: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({ width: 1, height: 1 });
  });
});
