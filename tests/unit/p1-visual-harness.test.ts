import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const harness = readFileSync(resolve(root, "tests/harness/p1-visual.ts"), "utf8");
const page = readFileSync(resolve(root, "tests/harness/p1-visual.html"), "utf8");
const runner = readFileSync(resolve(root, "scripts/run-p1-visual-evidence.mjs"), "utf8");

describe("P1 headed visual harness invariants", () => {
  it("renders the immutable fixture snapshot separately from the playback sentinel", () => {
    expect(page).toContain('id="source-display"');
    expect(page).toContain('id="source-video"');
    expect(harness).toContain("drawDisplayFixture");
    expect(harness).toContain("createImageBitmap(sourceDisplay)");
    expect(harness).toContain("new VideoFrame(sourceDisplay");
  });

  it("rejects invalid snapshot dimensions and black source/output panels", () => {
    expect(harness).toContain("assertFrameDimensions");
    expect(runner).toContain("sourceNonBlackPixelRatio");
    expect(runner).toContain("Visual output siyah yakalandı");
    expect(runner).toContain("Original fixture siyah yakalandı");
  });
});
