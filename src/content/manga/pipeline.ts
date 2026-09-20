import { enhanceMangaToCanvas } from "./canvas-enhancer";
import { isEligibleMangaImage } from "./eligibility";
import type { MangaPipelineOptions } from "./types";

const OVERLAY_ATTRIBUTE = "data-webgpu-upscaler-manga-overlay";

interface ImageRecord {
  readonly canvas: HTMLCanvasElement;
  readonly onLoad: () => void;
}

/** Opt-in, lazy static-image pipeline kept entirely separate from video code. */
export class MangaImagePipeline {
  readonly #document: Document;
  readonly #window: Window;
  readonly #options: Required<MangaPipelineOptions>;
  readonly #records = new Map<HTMLImageElement, ImageRecord>();
  readonly #inFlight = new WeakMap<HTMLImageElement, Promise<void>>();
  #intersectionObserver: IntersectionObserver | null = null;
  #mutationObserver: MutationObserver | null = null;
  #running = false;

  constructor(documentReference: Document = document, options: MangaPipelineOptions) {
    this.#document = documentReference;
    this.#window = documentReference.defaultView ?? window;
    this.#options = {
      enabled: options.enabled,
      minWidth: options.minWidth ?? 900,
      minHeight: options.minHeight ?? 900,
      tileSize: options.tileSize ?? 2048,
      overlap: options.overlap ?? 32,
    };
  }

  start(): void {
    if (this.#running || !this.#options.enabled) return;
    this.#running = true;
    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver(
        (entries: IntersectionObserverEntry[]) => {
          for (const entry of entries) {
            if (entry.isIntersecting && entry.target instanceof HTMLImageElement) {
              void this.process(entry.target);
            }
          }
        },
        { rootMargin: "300px" },
      );
      this.#intersectionObserver = observer;
      this.#document.querySelectorAll("img").forEach((image) => observer.observe(image));
    }
    if (typeof MutationObserver !== "undefined") {
      this.#mutationObserver = new MutationObserver((records: MutationRecord[]) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node instanceof HTMLImageElement) this.#intersectionObserver?.observe(node);
            if (node instanceof Element) {
              node
                .querySelectorAll("img")
                .forEach((image) => this.#intersectionObserver?.observe(image));
            }
          }
        }
      });
      this.#mutationObserver.observe(this.#document.documentElement, {
        childList: true,
        subtree: true,
      });
    }
    this.#window.addEventListener("resize", this.#handleLayout);
    this.#window.addEventListener("scroll", this.#handleLayout, true);
  }

  async process(image: HTMLImageElement): Promise<void> {
    if (!this.#running || this.#records.has(image)) return;
    const current = this.#inFlight.get(image);
    if (current) return current;
    const task = this.#processOnce(image);
    this.#inFlight.set(image, task);
    try {
      await task;
    } finally {
      // Keep completed work deduplicated while the image remains in the DOM.
      if (!this.#records.has(image)) this.#inFlight.delete(image);
    }
  }

  restore(image: HTMLImageElement): void {
    const record = this.#records.get(image);
    if (!record) return;
    record.canvas.remove();
    image.removeAttribute(OVERLAY_ATTRIBUTE);
    image.removeEventListener("load", record.onLoad);
    this.#records.delete(image);
  }

  stop(): void {
    this.#running = false;
    this.#intersectionObserver?.disconnect();
    this.#intersectionObserver = null;
    this.#mutationObserver?.disconnect();
    this.#mutationObserver = null;
    this.#window.removeEventListener("resize", this.#handleLayout);
    this.#window.removeEventListener("scroll", this.#handleLayout, true);
    for (const image of [...this.#records.keys()]) this.restore(image);
  }

  hasProcessed(image: HTMLImageElement): boolean {
    return this.#records.has(image);
  }

  #processOnce(image: HTMLImageElement): Promise<void> {
    if (!isEligibleMangaImage(image, this.#options)) return Promise.resolve();
    const canvas = this.#document.createElement("canvas");
    canvas.setAttribute(OVERLAY_ATTRIBUTE, "true");
    canvas.style.cssText = "position:fixed;pointer-events:none;z-index:2147483646;";
    const onLoad = (): void => this.restore(image);
    image.addEventListener("load", onLoad, { once: true });
    this.#document.documentElement.append(canvas);
    this.#records.set(image, { canvas, onLoad });
    this.#layout(image, canvas);
    try {
      enhanceMangaToCanvas(image, canvas, image.naturalWidth, image.naturalHeight, this.#options);
    } catch {
      this.restore(image);
    }
    return Promise.resolve();
  }

  #layout(image: HTMLImageElement, canvas: HTMLCanvasElement): void {
    const rect = image.getBoundingClientRect();
    canvas.style.left = `${rect.left}px`;
    canvas.style.top = `${rect.top}px`;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }

  readonly #handleLayout = (): void => {
    for (const [image, record] of this.#records) this.#layout(image, record.canvas);
  };
}
