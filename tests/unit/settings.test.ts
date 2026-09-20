import { DEFAULT_SETTINGS, normalizeSettings } from "../../src/core/settings";

describe("normalizeSettings", () => {
  it("uses safe defaults for malformed data", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(
      normalizeSettings({
        enabled: "yes",
        profile: "unknown",
        comparison: Number.NaN,
      }),
    ).toEqual(DEFAULT_SETTINGS);
  });

  it("clamps comparison and accepts supported values", () => {
    expect(
      normalizeSettings({
        enabled: true,
        profile: "anime",
        quality: "high",
        target: "3x",
        comparison: 140,
        showHud: true,
      }),
    ).toEqual({
      enabled: true,
      mangaEnabled: false,
      profile: "anime",
      quality: "high",
      target: "3x",
      comparison: 100,
      showHud: true,
    });
  });

  it("accepts manual real-life and screen/3D profiles", () => {
    expect(normalizeSettings({ profile: "live-action" }).profile).toBe("live-action");
    expect(normalizeSettings({ profile: "screen-3d" }).profile).toBe("screen-3d");
    expect(normalizeSettings({ profile: "safe" }).profile).toBe("safe");
  });
});
