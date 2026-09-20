import {
  AutoProfileSelector,
  classifyContent,
  resolveContentProfile,
  type ContentEvidence,
} from "../../src/core/profiles/auto-profile";

const animeEvidence: ContentEvidence = {
  metadata: { width: 1920, height: 1080 },
  spatial: { edgeDensity: 0.86, flatRegionRatio: 0.92, colorfulness: 0.82, textLikeRatio: 0.04 },
};
const screenEvidence: ContentEvidence = {
  metadata: { width: 1920, height: 1080 },
  spatial: { edgeDensity: 0.68, flatRegionRatio: 0.86, colorfulness: 0.08, textLikeRatio: 0.92 },
};
const liveEvidence: ContentEvidence = {
  metadata: { width: 1920, height: 1080 },
  spatial: { edgeDensity: 0.62, flatRegionRatio: 0.08, colorfulness: 0.34, textLikeRatio: 0.04 },
};

describe("P4 bounded auto profile", () => {
  it("classifies strong spatial evidence into separate profiles", () => {
    expect(classifyContent(animeEvidence).profile).toBe("anime");
    expect(classifyContent(screenEvidence).profile).toBe("screen-3d");
    expect(classifyContent(liveEvidence).profile).toBe("live-action");
  });

  it("falls back to safe when evidence is missing or ambiguous", () => {
    expect(classifyContent({}).profile).toBe("safe");
    expect(
      classifyContent({
        spatial: { edgeDensity: 0.5, flatRegionRatio: 0.5, colorfulness: 0.5, textLikeRatio: 0.5 },
      }).profile,
    ).toBe("safe");
  });

  it("requires hysteresis samples before switching and supports reset", () => {
    const selector = new AutoProfileSelector();
    expect(selector.observe(animeEvidence).profile).toBe("safe");
    expect(selector.observe(animeEvidence).profile).toBe("safe");
    expect(selector.observe(animeEvidence).changed).toBe(true);
    expect(selector.current()).toBe("anime");
    selector.reset();
    expect(selector.current()).toBe("safe");
  });

  it("does not switch on one noisy sample", () => {
    const selector = new AutoProfileSelector();
    selector.observe(animeEvidence);
    expect(selector.observe(liveEvidence).profile).toBe("safe");
    expect(selector.observe(liveEvidence).profile).toBe("safe");
  });

  it("always honors a manual profile regardless of auto state", () => {
    const selector = new AutoProfileSelector();
    selector.observe(animeEvidence);
    selector.observe(animeEvidence);
    selector.observe(animeEvidence);
    expect(resolveContentProfile("live-action", selector)).toBe("live-action");
    expect(resolveContentProfile("screen-3d", selector)).toBe("screen-3d");
    expect(resolveContentProfile("safe", selector)).toBe("safe");
  });
});
