const OVERLAY_ATTRIBUTE = "data-webgpu-upscaler-overlay";
const PLAYER_SELECTOR = ".html5-video-container, #movie_player, .html5-video-player";

interface HostStyleSnapshot {
  element: HTMLElement;
  inlinePosition: string;
  changedPosition: boolean;
}

function isRenderable(video: HTMLVideoElement, view: Window, rect: DOMRect): boolean {
  if (!video.isConnected || rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  const style = view.getComputedStyle(video);
  return style.display !== "none" && style.visibility !== "hidden";
}

/** Owns the non-interactive canvas layered above the source video. */
export class OverlayController {
  readonly #document: Document;
  readonly #view: Window & typeof globalThis;
  readonly #initialVideo: HTMLVideoElement | null;
  #video: HTMLVideoElement | null = null;
  #canvas: HTMLCanvasElement | null = null;
  #hostSnapshot: HostStyleSnapshot | null = null;
  #resizeObserver: ResizeObserver | null = null;
  #mutationObserver: MutationObserver | null = null;
  #layoutFrame: number | null = null;
  #requestedVisible = false;
  #status: HTMLElement | null = null;
  #hud: HTMLElement | null = null;
  #renderSize: { width: number; height: number } | null = null;

  constructor(documentReference: Document | HTMLVideoElement = document) {
    const initialVideo =
      documentReference.nodeType === 1 ? (documentReference as HTMLVideoElement) : null;
    const ownerDocument: Document = initialVideo
      ? initialVideo.ownerDocument
      : (documentReference as Document);
    const view = ownerDocument.defaultView as (Window & typeof globalThis) | null;
    if (view === null) {
      throw new Error("OverlayController requires a document with an active window");
    }

    this.#document = ownerDocument;
    this.#view = view;
    this.#initialVideo = initialVideo;
  }

  attach(
    video: HTMLVideoElement = this.#initialVideo ??
      (() => {
        throw new Error("OverlayController.attach requires a video");
      })(),
  ): HTMLCanvasElement {
    if (this.#video === video && this.#canvas !== null) {
      this.#ensureHost();
      this.#scheduleLayout();
      return this.#canvas;
    }

    this.detach();
    this.#video = video;
    this.#canvas = this.#createCanvas();
    this.#ensureHost();

    const ResizeObserverConstructor = this.#view.ResizeObserver;
    if (ResizeObserverConstructor !== undefined) {
      this.#resizeObserver = new ResizeObserverConstructor(() => {
        this.#scheduleLayout();
      });
      this.#resizeObserver.observe(video);
      if (this.#hostSnapshot !== null) {
        this.#resizeObserver.observe(this.#hostSnapshot.element);
      }
    }

    this.#mutationObserver = new this.#view.MutationObserver((records) => {
      const ElementConstructor = this.#view.Element;
      const hasRelevantChange = records.some((record) => {
        const target = record.target;
        return !(
          ElementConstructor !== undefined &&
          target instanceof ElementConstructor &&
          target.closest(`[${OVERLAY_ATTRIBUTE}]`) !== null
        );
      });
      if (!hasRelevantChange) {
        return;
      }

      this.#ensureHost();
      this.#scheduleLayout();
    });
    this.#mutationObserver.observe(this.#document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    this.#document.addEventListener("fullscreenchange", this.#handleLayoutChange);
    this.#document.addEventListener("yt-navigate-finish", this.#handleLayoutChange);
    this.#view.addEventListener("resize", this.#handleLayoutChange);
    this.#view.addEventListener("scroll", this.#handleLayoutChange, true);
    this.#syncLayout();

    return this.#canvas;
  }

  setVisible(visible: boolean): void {
    this.#requestedVisible = visible;
    this.#syncVisibility();
  }

  getCanvas(): HTMLCanvasElement | null {
    return this.#canvas;
  }

  get canvas(): HTMLCanvasElement {
    if (this.#canvas === null) {
      throw new Error("OverlayController is not attached");
    }
    return this.#canvas;
  }

  displaySize(): { width: number; height: number } {
    const rect = this.#video?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  }

  setRenderSize(size: { width: number; height: number }): void;
  setRenderSize(width: number, height: number): void;
  setRenderSize(sizeOrWidth: { width: number; height: number } | number, height?: number): void {
    const width = typeof sizeOrWidth === "number" ? sizeOrWidth : sizeOrWidth.width;
    const nextHeight = typeof sizeOrWidth === "number" ? height : sizeOrWidth.height;
    if (nextHeight === undefined) return;
    this.#renderSize = {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(nextHeight)),
    };
    if (this.#canvas !== null) {
      this.#canvas.width = this.#renderSize.width;
      this.#canvas.height = this.#renderSize.height;
    }
  }

  syncLayout(): void {
    this.#ensureHost();
    this.#syncLayout();
  }

  setComparison(percentage: number): void {
    if (this.#canvas !== null) {
      const right = Math.max(0, Math.min(100, 100 - percentage));
      this.#canvas.style.clipPath = `inset(0 ${right}% 0 0)`;
    }
  }

  setStatus(status: string, visible = true): void {
    const element = this.#status ?? this.#createStatus();
    element.textContent = status;
    element.style.display = visible ? "block" : "none";
    this.#hostSnapshot?.element.append(element);
  }

  setHud(visible: boolean, text?: string): void {
    const element = this.#hud ?? this.#createHud();
    if (text !== undefined) element.textContent = text;
    element.style.display = visible ? "block" : "none";
    this.#hostSnapshot?.element.append(element);
  }

  showEnhanced(): void {
    this.setVisible(true);
  }

  showOriginal(): void {
    this.setVisible(false);
  }

  remove(): void {
    this.detach();
  }

  detach(): void {
    if (this.#layoutFrame !== null) {
      this.#view.cancelAnimationFrame(this.#layoutFrame);
      this.#layoutFrame = null;
    }

    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#mutationObserver?.disconnect();
    this.#mutationObserver = null;
    this.#document.removeEventListener("fullscreenchange", this.#handleLayoutChange);
    this.#document.removeEventListener("yt-navigate-finish", this.#handleLayoutChange);
    this.#view.removeEventListener("resize", this.#handleLayoutChange);
    this.#view.removeEventListener("scroll", this.#handleLayoutChange, true);

    this.#canvas?.remove();
    this.#status?.remove();
    this.#hud?.remove();
    this.#restoreHostPosition();
    this.#canvas = null;
    this.#video = null;
    this.#status = null;
    this.#hud = null;
    this.#renderSize = null;
    this.#requestedVisible = false;
  }

  readonly #handleLayoutChange = (): void => {
    this.#ensureHost();
    this.#scheduleLayout();
  };

  #createCanvas(): HTMLCanvasElement {
    const canvas = this.#document.createElement("canvas");
    canvas.setAttribute(OVERLAY_ATTRIBUTE, "");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.position = "absolute";
    canvas.style.display = "block";
    canvas.style.pointerEvents = "none";
    canvas.style.touchAction = "none";
    canvas.style.userSelect = "none";
    canvas.style.zIndex = "1";
    canvas.style.visibility = "hidden";
    canvas.style.opacity = "0";
    canvas.style.margin = "0";
    canvas.style.padding = "0";
    canvas.style.border = "0";
    canvas.dataset.webgpuUpscaler = "canvas";
    return canvas;
  }

  #findHost(): HTMLElement | null {
    if (this.#video === null) {
      return null;
    }

    return (
      this.#video.closest<HTMLElement>(PLAYER_SELECTOR) ??
      this.#video.parentElement ??
      this.#document.body
    );
  }

  #ensureHost(): void {
    const canvas = this.#canvas;
    // Keep a detached source's canvas in its existing host until the source
    // is attached again or the controller is explicitly detached. This avoids
    // moving the overlay to document.body during YouTube DOM transitions.
    if (this.#video === null || !this.#video.isConnected) {
      return;
    }

    const nextHost = this.#findHost();
    if (canvas === null || nextHost === null || this.#hostSnapshot?.element === nextHost) {
      return;
    }

    const previousHost = this.#hostSnapshot?.element;
    this.#restoreHostPosition();

    const inlinePosition = nextHost.style.position;
    const changedPosition = this.#view.getComputedStyle(nextHost).position === "static";
    if (changedPosition) {
      nextHost.style.position = "relative";
    }

    this.#hostSnapshot = { element: nextHost, inlinePosition, changedPosition };
    nextHost.append(canvas);
    if (this.#status !== null) nextHost.append(this.#status);
    if (this.#hud !== null) nextHost.append(this.#hud);

    if (this.#resizeObserver !== null && previousHost !== nextHost) {
      if (previousHost !== undefined) {
        this.#resizeObserver.unobserve(previousHost);
      }
      this.#resizeObserver.observe(nextHost);
    }
  }

  #restoreHostPosition(): void {
    const snapshot = this.#hostSnapshot;
    if (
      snapshot !== null &&
      snapshot.changedPosition &&
      snapshot.element.style.position === "relative"
    ) {
      snapshot.element.style.position = snapshot.inlinePosition;
    }
    this.#hostSnapshot = null;
  }

  #scheduleLayout(): void {
    if (this.#layoutFrame !== null || this.#canvas === null) {
      return;
    }

    this.#layoutFrame = this.#view.requestAnimationFrame(() => {
      this.#layoutFrame = null;
      this.#syncLayout();
    });
  }

  #syncLayout(): void {
    const video = this.#video;
    const canvas = this.#canvas;
    const host = this.#hostSnapshot?.element;
    if (video === null || canvas === null || host === undefined) {
      return;
    }

    const videoRect = video.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const scaleX =
      host.clientWidth > 0 && hostRect.width > 0 ? hostRect.width / host.clientWidth : 1;
    const scaleY =
      host.clientHeight > 0 && hostRect.height > 0 ? hostRect.height / host.clientHeight : 1;
    const cssWidth = videoRect.width / scaleX;
    const cssHeight = videoRect.height / scaleY;
    const pixelRatio = Math.max(1, this.#view.devicePixelRatio || 1);
    const backingWidth =
      this.#renderSize?.width ?? Math.max(1, Math.round(videoRect.width * pixelRatio));
    const backingHeight =
      this.#renderSize?.height ?? Math.max(1, Math.round(videoRect.height * pixelRatio));

    canvas.style.left = `${(videoRect.left - hostRect.left) / scaleX + host.scrollLeft}px`;
    canvas.style.top = `${(videoRect.top - hostRect.top) / scaleY + host.scrollTop}px`;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    if (canvas.width !== backingWidth) {
      canvas.width = backingWidth;
    }
    if (canvas.height !== backingHeight) {
      canvas.height = backingHeight;
    }

    this.#syncVisibility(isRenderable(video, this.#view, videoRect));
  }

  #createStatus(): HTMLElement {
    const element = this.#document.createElement("div");
    element.dataset.webgpuUpscaler = "status";
    element.style.position = "absolute";
    element.style.right = "8px";
    element.style.top = "8px";
    element.style.zIndex = "2";
    element.style.pointerEvents = "none";
    element.style.color = "white";
    element.style.background = "rgb(0 0 0 / 65%)";
    element.style.padding = "4px 8px";
    element.style.font = "12px sans-serif";
    this.#status = element;
    return element;
  }

  #createHud(): HTMLElement {
    const element = this.#document.createElement("pre");
    element.dataset.webgpuUpscaler = "hud";
    element.style.position = "absolute";
    element.style.left = "8px";
    element.style.top = "8px";
    element.style.zIndex = "3";
    element.style.pointerEvents = "none";
    element.style.margin = "0";
    element.style.color = "white";
    element.style.background = "rgb(0 0 0 / 65%)";
    element.style.padding = "6px";
    element.style.font = "12px monospace";
    this.#hud = element;
    return element;
  }

  #syncVisibility(renderable?: boolean): void {
    const canvas = this.#canvas;
    if (canvas === null) {
      return;
    }

    const video = this.#video;
    const canRender =
      renderable ??
      (video !== null && isRenderable(video, this.#view, video.getBoundingClientRect()));
    canvas.style.visibility = this.#requestedVisible && canRender ? "visible" : "hidden";
    canvas.style.opacity = this.#requestedVisible && canRender ? "1" : "0";
  }
}
