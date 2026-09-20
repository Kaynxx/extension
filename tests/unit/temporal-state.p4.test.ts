import { isSceneCut, TemporalStateBoundary } from "../../src/core/scheduling/temporalState";

describe("P4 temporal reset boundaries", () => {
  it("detects backwards media time and presented-frame counters", () => {
    const boundary = new TemporalStateBoundary();
    expect(boundary.observe({ mediaTime: 10, presentedFrames: 20 })).toBeUndefined();
    expect(boundary.observe({ mediaTime: 9, presentedFrames: 21 })).toBe("seek");
    expect(boundary.observe({ mediaTime: 11, presentedFrames: 2 })).toBe("seek");
  });

  it("increments reset generations and emits explicit reasons", () => {
    const boundary = new TemporalStateBoundary();
    const reasons: string[] = [];
    boundary.onReset((event) => reasons.push(`${event.reason}:${event.generation}`));
    expect(boundary.reset("scene-cut").generation).toBe(1);
    expect(boundary.reset("quality-change").generation).toBe(2);
    expect(reasons).toEqual(["scene-cut:1", "quality-change:2"]);
  });

  it("keeps scene-cut detection bounded and deterministic", () => {
    expect(isSceneCut([0, 0, 0], [0.2, 0.2, 0.2])).toBe(false);
    expect(isSceneCut([0, 0, 0], [1, 0.8, 0.9])).toBe(true);
    expect(isSceneCut([], [])).toBe(false);
  });
});
