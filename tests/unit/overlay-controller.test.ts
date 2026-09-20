import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OverlayController } from "../../src/content/youtube/overlay-controller";

let resizeCallbacks: ResizeObserverCallback[];

class ResizeObserverStub implements ResizeObserver {
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    resizeCallbacks.push(callback);
  }
}

function setRect(element: Element, rect: Partial<DOMRect>): ReturnType<typeof vi.spyOn> {
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
  return vi.spyOn(element, "getBoundingClientRect").mockReturnValue(completeRect);
}

function setClientSize(element: HTMLElement, width: number, height: number): void {
  Object.defineProperties(element, {
    clientWidth: { configurable: true, value: width },
    clientHeight: { configurable: true, value: height },
  });
}

async function flushAnimationFrame(): Promise<void> {
  await Promise.resolve();
  vi.runOnlyPendingTimers();
  await Promise.resolve();
}

describe("OverlayController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    resizeCallbacks = [];
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      return window.setTimeout(() => callback(performance.now()), 0);
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => {
      window.clearTimeout(handle);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function createPlayer(): {
    player: HTMLElement;
    videoContainer: HTMLElement;
    video: HTMLVideoElement;
    controls: HTMLElement;
  } {
    const player = document.createElement("div");
    player.id = "movie_player";
    const videoContainer = document.createElement("div");
    videoContainer.className = "html5-video-container";
    videoContainer.style.position = "static";
    const video = document.createElement("video");
    const controls = document.createElement("div");
    controls.className = "ytp-chrome-bottom";
    videoContainer.append(video);
    player.append(videoContainer, controls);
    document.body.append(player);
    setClientSize(videoContainer, 1280, 720);
    setRect(videoContainer, { left: 10, top: 20, width: 1280, height: 720 });
    setRect(video, { left: 110, top: 70, width: 960, height: 540 });
    return { player, videoContainer, video, controls };
  }

  it("attaches an initially hidden, non-interactive canvas without touching the video", () => {
    const { videoContainer, video, controls } = createPlayer();
    video.currentTime = 17;
    video.muted = true;
    video.playbackRate = 1.5;
    video.style.objectFit = "contain";
    const sourceState = {
      currentTime: video.currentTime,
      muted: video.muted,
      playbackRate: video.playbackRate,
      style: video.getAttribute("style"),
    };
    const overlay = new OverlayController(document);

    const canvas = overlay.attach(video);

    expect(canvas.parentElement).toBe(videoContainer);
    expect(canvas.nextElementSibling).not.toBe(controls);
    expect(canvas.style.pointerEvents).toBe("none");
    expect(canvas.style.visibility).toBe("hidden");
    expect(canvas.style.left).toBe("100px");
    expect(canvas.style.top).toBe("50px");
    expect(canvas.style.width).toBe("960px");
    expect(canvas.style.height).toBe("540px");
    expect(canvas.width).toBe(1920);
    expect(canvas.height).toBe(1080);
    expect({
      currentTime: video.currentTime,
      muted: video.muted,
      playbackRate: video.playbackRate,
      style: video.getAttribute("style"),
    }).toEqual(sourceState);

    overlay.detach();
  });

  it("is idempotent and controls visibility only on the overlay", () => {
    const { videoContainer, video } = createPlayer();
    const overlay = new OverlayController(document);
    const firstCanvas = overlay.attach(video);
    const secondCanvas = overlay.attach(video);

    overlay.setVisible(true);

    expect(secondCanvas).toBe(firstCanvas);
    expect(videoContainer.querySelectorAll("canvas")).toHaveLength(1);
    expect(firstCanvas.style.visibility).toBe("visible");
    expect(video.style.visibility).toBe("");

    overlay.setVisible(false);
    expect(firstCanvas.style.visibility).toBe("hidden");
    expect(video.style.visibility).toBe("");
    overlay.detach();
  });

  it("tracks player resize and safely hides when the source leaves the DOM", async () => {
    const { videoContainer, video } = createPlayer();
    const videoRectSpy = vi.mocked(video.getBoundingClientRect);
    const overlay = new OverlayController(document);
    const canvas = overlay.attach(video);
    overlay.setVisible(true);
    expect(canvas.style.visibility).toBe("visible");

    videoRectSpy.mockReturnValue({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      width: 1280,
      height: 720,
      right: 1290,
      bottom: 740,
      toJSON: () => ({}),
    });
    resizeCallbacks[0]?.([], {} as ResizeObserver);
    await flushAnimationFrame();

    expect(canvas.width).toBe(2560);
    expect(canvas.height).toBe(1440);

    video.remove();
    document.dispatchEvent(new Event("fullscreenchange"));
    await flushAnimationFrame();
    expect(canvas.style.visibility).toBe("hidden");
    expect(videoContainer.contains(canvas)).toBe(true);

    overlay.detach();
  });

  it("removes the canvas and restores a fallback host position on detach", () => {
    const host = document.createElement("div");
    host.style.position = "static";
    const video = document.createElement("video");
    host.append(video);
    document.body.append(host);
    setClientSize(host, 640, 360);
    setRect(host, { width: 640, height: 360 });
    setRect(video, { width: 640, height: 360 });
    const overlay = new OverlayController(document);
    const canvas = overlay.attach(video);

    expect(host.style.position).toBe("relative");
    overlay.detach();

    expect(canvas.isConnected).toBe(false);
    expect(host.style.position).toBe("static");
    expect(overlay.getCanvas()).toBeNull();
  });

  it("renders non-interactive status and HUD layers and preserves the render backing size", () => {
    const { videoContainer, video } = createPlayer();
    const overlay = new OverlayController(document);
    const canvas = overlay.attach(video);

    overlay.setRenderSize({ width: 3840, height: 2160 });
    overlay.setComparison(55);
    overlay.setStatus("WebGPU aktif");
    overlay.setHud(true, "p95 8.0 ms");

    const status = videoContainer.querySelector<HTMLElement>('[data-webgpu-upscaler="status"]');
    const hud = videoContainer.querySelector<HTMLElement>('[data-webgpu-upscaler="hud"]');
    expect(canvas.width).toBe(3840);
    expect(canvas.height).toBe(2160);
    expect(canvas.style.clipPath).toBe("inset(0 45% 0 0)");
    expect(status?.textContent).toBe("WebGPU aktif");
    expect(status?.style.pointerEvents).toBe("none");
    expect(hud?.textContent).toBe("p95 8.0 ms");
    expect(hud?.style.pointerEvents).toBe("none");

    overlay.detach();
    expect(status?.isConnected).toBe(false);
    expect(hud?.isConnected).toBe(false);
  });
});
