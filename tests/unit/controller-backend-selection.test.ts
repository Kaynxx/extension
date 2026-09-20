import { describe, expect, it } from "vitest";
import {
  ANIME_ADAPTIVE_FRAME_BUDGET_MS,
  selectBackendKind,
  selectProcessingPath,
  type BackendSelection,
} from "../../src/content/youtube/upscaler-controller";

describe("production backend selection", () => {
  it("uses the explicit 24 ms anime adaptive budget", () => {
    expect(ANIME_ADAPTIVE_FRAME_BUDGET_MS).toBe(24);
  });

  it("selects Anime4K only for the anime profile and direct x2/x3 geometry", () => {
    expect(
      selectBackendKind("anime", { width: 1920, height: 1080 }, { width: 3840, height: 2160 }),
    ).toBe<BackendSelection>("anime");
    expect(
      selectBackendKind("anime", { width: 1280, height: 720 }, { width: 3840, height: 2160 }),
    ).toBe<BackendSelection>("anime");
  });

  it("keeps non-anime and arbitrary-ratio content on the safe backend", () => {
    expect(
      selectBackendKind(
        "live-action",
        { width: 1920, height: 1080 },
        { width: 3840, height: 2160 },
      ),
    ).toBe<BackendSelection>("safe");
    expect(
      selectBackendKind("anime", { width: 1920, height: 1080 }, { width: 2560, height: 1440 }),
    ).toBe<BackendSelection>("safe");
  });

  it("routes real-life and screen/3D to their conservative profile shader family", () => {
    const input = { width: 1920, height: 1080 };
    const output = { width: 3840, height: 2160 };
    expect(selectProcessingPath("live-action", input, output)).toBe("profile");
    expect(selectProcessingPath("screen-3d", input, output)).toBe("profile");
    expect(selectProcessingPath("safe", input, output)).toBe("safe");
  });
});
