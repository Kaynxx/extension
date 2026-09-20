import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isEligibleMangaImage } from "../../src/content/manga/eligibility";
import { MangaImagePipeline } from "../../src/content/manga/pipeline";
import { createMangaTiles } from "../../src/content/manga/tiling";

class IntersectionObserverStub implements IntersectionObserver {
  static callback: IntersectionObserverCallback | undefined;
  readonly root = null;
  readonly rootMargin = "300px";
  readonly scrollMargin = "0px";
  readonly thresholds: readonly number[] = [0];
  constructor(callback: IntersectionObserverCallback) {
    IntersectionObserverStub.callback = callback;
  }
  disconnect(): void {}
  observe(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  unobserve(): void {}
}

function prepareImage(): HTMLImageElement {
  const image = document.createElement("img");
  Object.defineProperties(image, {
    complete: { configurable: true, value: true },
    naturalWidth: { configurable: true, value: 1200 },
    naturalHeight: { configurable: true, value: 1800 },
    currentSrc: { configurable: true, value: "https://reader.test/page.png" },
  });
  image.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 600,
    height: 900,
    right: 600,
    bottom: 900,
    toJSON: () => ({}),
  });
  document.body.append(image);
  return image;
}

describe("P5 manga static pipeline", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
      drawImage: vi.fn(),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it("accepts portrait pages but rejects animated or media-adjacent images", () => {
    const image = prepareImage();
    expect(isEligibleMangaImage(image)).toBe(true);
    image.dataset.animated = "true";
    expect(isEligibleMangaImage(image)).toBe(false);
    image.dataset.animated = "false";
    const video = document.createElement("video");
    video.append(image);
    expect(isEligibleMangaImage(image)).toBe(false);
  });

  it("creates overlapping tiles without exceeding page bounds", () => {
    const tiles = createMangaTiles(5000, 3000, 1024, 32);
    expect(tiles.length).toBeGreaterThan(1);
    expect(tiles.every((tile) => tile.x + tile.width <= 5000 && tile.y + tile.height <= 3000)).toBe(
      true,
    );
    const row = tiles.filter((tile) => tile.y === 0);
    expect(row.length).toBeGreaterThan(1);
    expect(row[1]!.x).toBeLessThan(row[0]!.x + row[0]!.width);
  });

  it("processes an intersecting image once and restores the original", async () => {
    const image = prepareImage();
    const pipeline = new MangaImagePipeline(document, { enabled: true, tileSize: 512 });
    pipeline.start();
    const entry = { target: image, isIntersecting: true } as unknown as IntersectionObserverEntry;
    IntersectionObserverStub.callback?.([entry], {} as IntersectionObserver);
    await pipeline.process(image);
    await pipeline.process(image);
    expect(pipeline.hasProcessed(image)).toBe(true);
    expect(document.querySelectorAll("canvas")).toHaveLength(1);
    pipeline.restore(image);
    expect(pipeline.hasProcessed(image)).toBe(false);
    expect(document.querySelectorAll("canvas")).toHaveLength(0);
    pipeline.stop();
  });
});
