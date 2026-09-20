export type VideoChangeListener = (video: HTMLVideoElement | null) => void;

const VIDEO_SELECTOR = "video.html5-main-video, #movie_player video, video";
const EXTENSION_NODE_SELECTOR = "[data-webgpu-upscaler], [data-webgpu-upscaler-overlay]";
const MEDIA_EVENTS = [
  "play",
  "pause",
  "loadedmetadata",
  "resize",
  "emptied",
  "volumechange",
] as const;

function visibleArea(rect: DOMRect, view: Window): number {
  const width = Math.max(0, Math.min(rect.right, view.innerWidth) - Math.max(rect.left, 0));
  const height = Math.max(0, Math.min(rect.bottom, view.innerHeight) - Math.max(rect.top, 0));
  return width * height;
}

function candidateScore(video: HTMLVideoElement, view: Window): number {
  if (!video.isConnected || video.readyState < HTMLMediaElement.HAVE_METADATA) {
    return Number.NEGATIVE_INFINITY;
  }

  const style = view.getComputedStyle(video);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    Number.parseFloat(style.opacity || "1") === 0
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  const rect = video.getBoundingClientRect();
  const area = visibleArea(rect, view);
  if (rect.width <= 0 || rect.height <= 0 || area <= 0) {
    return Number.NEGATIVE_INFINITY;
  }

  const youtubePlayerBonus = video.closest("#movie_player, .html5-video-player") ? 1e12 : 0;
  const playingBonus = !video.paused && !video.ended ? 1e9 : 0;
  const sourceAreaBonus = video.videoWidth * video.videoHeight;

  return youtubePlayerBonus + area * 1e4 + playingBonus + sourceAreaBonus;
}

/** Finds the active, visible YouTube video without mutating media state. */
export class VideoLocator {
  readonly #document: Document;
  readonly #view: Window & typeof globalThis;
  readonly #listeners = new Set<VideoChangeListener>();
  #activeVideo: HTMLVideoElement | null = null;
  #mutationObserver: MutationObserver | null = null;
  #started = false;
  #evaluationScheduled = false;
  #activeSourceSize: { width: number; height: number } | null = null;

  constructor();
  constructor(documentReference: Document);
  constructor(listener: VideoChangeListener);
  constructor(documentReferenceOrListener?: Document | VideoChangeListener);
  constructor(documentReferenceOrListener: Document | VideoChangeListener = document) {
    const documentReference =
      typeof documentReferenceOrListener === "function" ? document : documentReferenceOrListener;
    const view = documentReference.defaultView as (Window & typeof globalThis) | null;
    if (view === null) {
      throw new Error("VideoLocator requires a document with an active window");
    }

    this.#document = documentReference;
    this.#view = view;
    if (typeof documentReferenceOrListener === "function") {
      this.#listeners.add(documentReferenceOrListener);
    }
  }

  start(): void {
    if (this.#started) {
      return;
    }

    this.#started = true;
    const MutationObserverConstructor = this.#view.MutationObserver;
    this.#mutationObserver = new MutationObserverConstructor((records) => {
      // Overlay/HUD churn is intentionally invisible to source selection.
      // YouTube frequently mutates the same player subtree while controls are
      // shown; extension-owned nodes must not cause duplicate source events.
      if (records.length > 0 && records.every(isExtensionMutation)) return;
      this.#scheduleEvaluation();
    });

    const root = this.#document.documentElement;
    this.#mutationObserver?.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "hidden", "style"],
    });

    for (const eventName of MEDIA_EVENTS) {
      this.#document.addEventListener(eventName, this.#handleRelevantEvent, true);
    }
    this.#document.addEventListener("yt-navigate-finish", this.#handleRelevantEvent);
    this.#document.addEventListener("fullscreenchange", this.#handleRelevantEvent);
    this.#view.addEventListener("resize", this.#handleRelevantEvent);

    this.#evaluate();
  }

  stop(): void {
    if (!this.#started) {
      return;
    }

    this.#started = false;
    this.#evaluationScheduled = false;
    this.#mutationObserver?.disconnect();
    this.#mutationObserver = null;

    for (const eventName of MEDIA_EVENTS) {
      this.#document.removeEventListener(eventName, this.#handleRelevantEvent, true);
    }
    this.#document.removeEventListener("yt-navigate-finish", this.#handleRelevantEvent);
    this.#document.removeEventListener("fullscreenchange", this.#handleRelevantEvent);
    this.#view.removeEventListener("resize", this.#handleRelevantEvent);

    this.#setActiveVideo(null);
  }

  subscribe(listener: VideoChangeListener): () => void {
    this.#listeners.add(listener);
    listener(this.#activeVideo);

    return () => {
      this.#listeners.delete(listener);
    };
  }

  current(): HTMLVideoElement | null {
    return this.#activeVideo;
  }

  readonly #handleRelevantEvent = (): void => {
    this.#scheduleEvaluation();
  };

  #scheduleEvaluation(): void {
    if (!this.#started || this.#evaluationScheduled) {
      return;
    }

    this.#evaluationScheduled = true;
    this.#view.queueMicrotask(() => {
      this.#evaluationScheduled = false;
      if (this.#started) {
        this.#evaluate();
      }
    });
  }

  #evaluate(): void {
    let bestVideo: HTMLVideoElement | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const video of this.#document.querySelectorAll<HTMLVideoElement>(VIDEO_SELECTOR)) {
      const score = candidateScore(video, this.#view);
      if (score > bestScore) {
        bestVideo = video;
        bestScore = score;
      }
    }

    this.#setActiveVideo(bestVideo);
  }

  #setActiveVideo(nextVideo: HTMLVideoElement | null): void {
    const nextSourceSize = nextVideo === null ? null : sourceSize(nextVideo);
    if (this.#activeVideo === nextVideo) {
      // A YouTube quality change can keep the same HTMLVideoElement while
      // replacing its media track. Treat that as a meaningful source change
      // so the controller can resize its GPU resources without replacing the
      // source video or creating another overlay.
      if (!sameSourceSize(this.#activeSourceSize, nextSourceSize)) {
        this.#activeSourceSize = nextSourceSize;
        if (nextVideo !== null) {
          for (const listener of this.#listeners) {
            listener(nextVideo);
          }
        }
      }
      return;
    }

    this.#activeVideo = nextVideo;
    this.#activeSourceSize = nextSourceSize;
    for (const listener of this.#listeners) {
      listener(nextVideo);
    }
  }
}

function isExtensionMutation(record: MutationRecord): boolean {
  const target = record.target;
  if (target instanceof Element && target.closest(EXTENSION_NODE_SELECTOR) !== null) {
    return true;
  }
  const nodes = [...record.addedNodes, ...record.removedNodes];
  return (
    nodes.length > 0 &&
    nodes.every((node) => {
      return (
        node.nodeType === Node.ELEMENT_NODE && (node as Element).matches(EXTENSION_NODE_SELECTOR)
      );
    })
  );
}

function sourceSize(video: HTMLVideoElement): { width: number; height: number } {
  return {
    width: video.videoWidth,
    height: video.videoHeight,
  };
}

function sameSourceSize(
  first: { width: number; height: number } | null,
  second: { width: number; height: number } | null,
): boolean {
  return first?.width === second?.width && first?.height === second?.height;
}
