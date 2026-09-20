import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VideoLocator } from "../../src/content/youtube/video-locator";

function setRect(element: Element, rect: Partial<DOMRect>): void {
  const completeRect = {
    x: rect.left ?? 0,
    y: rect.top ?? 0,
    left: rect.left ?? 0,
    top: rect.top ?? 0,
    width: rect.width ?? 0,
    height: rect.height ?? 0,
    right: (rect.left ?? 0) + (rect.width ?? 0),
    bottom: (rect.top ?? 0) + (rect.height ?? 0),
    toJSON: () => ({}),
  } satisfies DOMRect;
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(completeRect);
}

function makeReady(video: HTMLVideoElement, width = 1920, height = 1080): void {
  Object.defineProperties(video, {
    readyState: { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA },
    videoWidth: { configurable: true, value: width },
    videoHeight: { configurable: true, value: height },
  });
}

function setSourceSize(video: HTMLVideoElement, width: number, height: number): void {
  Object.defineProperties(video, {
    videoWidth: { configurable: true, value: width },
    videoHeight: { configurable: true, value: height },
  });
}

async function flushDomObservers(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("VideoLocator", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    Object.defineProperties(window, {
      innerWidth: { configurable: true, value: 1920 },
      innerHeight: { configurable: true, value: 1080 },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("selects the visible YouTube player video and publishes it immediately", () => {
    const player = document.createElement("div");
    player.id = "movie_player";
    const main = document.createElement("video");
    const unrelated = document.createElement("video");
    player.append(main);
    document.body.append(player, unrelated);
    makeReady(main);
    makeReady(unrelated, 3840, 2160);
    setRect(main, { left: 100, top: 100, width: 1280, height: 720 });
    setRect(unrelated, { left: 0, top: 0, width: 1920, height: 1080 });

    const locator = new VideoLocator(document);
    const listener = vi.fn();
    locator.start();
    locator.subscribe(listener);

    expect(locator.current()).toBe(main);
    expect(listener).toHaveBeenLastCalledWith(main);
    locator.stop();
  });

  it("tracks a replacement video across YouTube SPA DOM changes", async () => {
    const player = document.createElement("div");
    player.id = "movie_player";
    const first = document.createElement("video");
    player.append(first);
    document.body.append(player);
    makeReady(first);
    setRect(first, { width: 1280, height: 720 });

    const locator = new VideoLocator(document);
    const listener = vi.fn();
    locator.subscribe(listener);
    locator.start();
    expect(locator.current()).toBe(first);

    const replacement = document.createElement("video");
    makeReady(replacement, 1280, 720);
    setRect(replacement, { width: 1280, height: 720 });
    player.replaceChildren(replacement);
    document.dispatchEvent(new Event("yt-navigate-finish"));
    await flushDomObservers();

    expect(locator.current()).toBe(replacement);
    expect(listener).toHaveBeenLastCalledWith(replacement);
    locator.stop();
  });

  it("rejects hidden or metadata-less video and clears on stop", () => {
    const hidden = document.createElement("video");
    hidden.style.display = "none";
    makeReady(hidden);
    setRect(hidden, { width: 1280, height: 720 });
    const pending = document.createElement("video");
    setRect(pending, { width: 1280, height: 720 });
    document.body.append(hidden, pending);

    const locator = new VideoLocator(document);
    const listener = vi.fn();
    locator.subscribe(listener);
    locator.start();

    expect(locator.current()).toBeNull();
    locator.stop();
    expect(listener).toHaveBeenLastCalledWith(null);
  });

  it("does not alter playback, audio, or source video styles", () => {
    const player = document.createElement("div");
    player.id = "movie_player";
    const video = document.createElement("video");
    video.currentTime = 42;
    video.muted = true;
    video.playbackRate = 1.25;
    video.style.objectFit = "contain";
    player.append(video);
    document.body.append(player);
    makeReady(video);
    setRect(video, { width: 1280, height: 720 });
    const before = {
      currentTime: video.currentTime,
      muted: video.muted,
      playbackRate: video.playbackRate,
      style: video.getAttribute("style"),
    };

    const locator = new VideoLocator(document);
    locator.start();
    locator.stop();

    expect({
      currentTime: video.currentTime,
      muted: video.muted,
      playbackRate: video.playbackRate,
      style: video.getAttribute("style"),
    }).toEqual(before);
  });

  it("supports the callback constructor used by the content-script adapter", async () => {
    const player = document.createElement("div");
    player.id = "movie_player";
    const video = document.createElement("video");
    player.append(video);
    document.body.append(player);
    makeReady(video);
    setRect(video, { width: 1280, height: 720 });
    const onVideoChange = vi.fn();

    const locator = new VideoLocator(onVideoChange);
    locator.start();
    await flushDomObservers();

    expect(onVideoChange).toHaveBeenLastCalledWith(video);
    locator.stop();
  });

  it("publishes an intrinsic source-size change for the same video element", async () => {
    const player = document.createElement("div");
    player.id = "movie_player";
    const video = document.createElement("video");
    player.append(video);
    document.body.append(player);
    makeReady(video, 1920, 1080);
    setRect(video, { width: 1280, height: 720 });
    const onVideoChange = vi.fn();

    const locator = new VideoLocator(onVideoChange);
    locator.start();
    expect(onVideoChange).toHaveBeenLastCalledWith(video);
    expect(onVideoChange).toHaveBeenCalledTimes(1);

    setSourceSize(video, 1280, 720);
    video.dispatchEvent(new Event("resize"));
    await flushDomObservers();

    expect(locator.current()).toBe(video);
    expect(onVideoChange).toHaveBeenLastCalledWith(video);
    expect(onVideoChange).toHaveBeenCalledTimes(2);
    locator.stop();
  });

  it("does not republish duplicate source events when intrinsic dimensions are unchanged", async () => {
    const player = document.createElement("div");
    player.id = "movie_player";
    const video = document.createElement("video");
    player.append(video);
    document.body.append(player);
    makeReady(video, 1920, 1080);
    setRect(video, { width: 1280, height: 720 });
    const onVideoChange = vi.fn();

    const locator = new VideoLocator(onVideoChange);
    locator.start();
    video.dispatchEvent(new Event("loadedmetadata"));
    video.dispatchEvent(new Event("resize"));
    await flushDomObservers();

    expect(onVideoChange).toHaveBeenCalledTimes(1);
    locator.stop();
  });

  it("ignores extension-owned overlay and HUD mutations", async () => {
    const player = document.createElement("div");
    player.id = "movie_player";
    const video = document.createElement("video");
    player.append(video);
    document.body.append(player);
    makeReady(video);
    setRect(video, { width: 1280, height: 720 });
    const onVideoChange = vi.fn();
    const locator = new VideoLocator(onVideoChange);
    locator.start();
    expect(onVideoChange).toHaveBeenCalledTimes(1);

    const overlay = document.createElement("canvas");
    overlay.setAttribute("data-webgpu-upscaler-overlay", "");
    const hud = document.createElement("pre");
    hud.setAttribute("data-webgpu-upscaler", "hud");
    player.append(overlay, hud);
    overlay.style.opacity = "1";
    await flushDomObservers();

    expect(onVideoChange).toHaveBeenCalledTimes(1);
    locator.stop();
  });
});
