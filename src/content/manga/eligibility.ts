const ANIMATED_EXTENSION = /\.(?:gif|apng)(?:$|[?#])/i;
const MANGA_HINT = /(?:manga|manhwa|manhua|webtoon|comic|chapter|scan)/i;

export interface MangaEligibilityOptions {
  readonly minWidth?: number;
  readonly minHeight?: number;
}

/**
 * Conservative, opt-in image detection. It intentionally rejects images near
 * media elements and common animated formats; callers still need to enable the
 * manga setting before invoking it.
 */
export function isEligibleMangaImage(
  image: HTMLImageElement,
  options: MangaEligibilityOptions = {},
): boolean {
  const minWidth = options.minWidth ?? 900;
  const minHeight = options.minHeight ?? 900;
  if (!image.isConnected || !image.complete || image.naturalWidth < minWidth) return false;
  if (image.naturalHeight < minHeight || !image.currentSrc) return false;
  if (ANIMATED_EXTENSION.test(image.currentSrc)) return false;
  if (image.dataset.animated === "true" || image.closest("video, audio, canvas") !== null) {
    return false;
  }

  const hint = [
    image.alt,
    image.title,
    image.className,
    image.closest("[class], [id]")?.getAttribute("class"),
    image.closest("[class], [id]")?.getAttribute("id"),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  // Portrait pages are the safest generic signal. A textual hint is accepted
  // for landscape pages used by comic readers.
  const portraitPage = image.naturalHeight >= image.naturalWidth * 1.1;
  return portraitPage || MANGA_HINT.test(hint);
}

export function isAnimatedMangaSource(image: HTMLImageElement): boolean {
  return (
    ANIMATED_EXTENSION.test(image.currentSrc || image.src) || image.dataset.animated === "true"
  );
}
