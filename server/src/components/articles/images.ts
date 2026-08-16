import { parseHTML } from "linkedom";

/**
 * The pictures inside an article, as urls — nothing is downloaded. What is
 * stored is a reference to the publisher's own copy, which the modal loads
 * directly the way a browser would if you opened the page.
 *
 * The markup this has to survive is worse than it sounds. One photo commonly
 * arrives as a `<picture>` holding six `<source srcset>` variants (webp and
 * png, at three widths), and taking them all would file the same image six
 * times. Paths are often relative to the article. Lazy-loading sites ship a
 * grey placeholder in `src` and the real url in `srcset`. And the same
 * `<img>` tag that carries a photograph also carries the 24×24 logo sitting
 * inline in a sentence.
 */

export type ArticleImage = {
  url: string;
  /** The alt text, which is often the only description of the picture. */
  alt: string | null;
  /** A `<figcaption>` under it, where the publisher wrote one. */
  caption: string | null;
};

/** More than any article needs, and enough to stop a gallery page running away. */
const MAX_IMAGES = 24;

/**
 * Declared width or height under this means a glyph — a logo mid-sentence, an
 * author avatar, a tracking pixel — rather than a picture worth showing.
 */
const MIN_DIMENSION = 100;

/** Filenames that are, by their own admission, not the image. */
const PLACEHOLDER = /placeholder|spacer|blank\.|1x1\.|pixel\.|transparent\./i;

export function extractImages(html: string, baseUrl: string): ArticleImage[] {
  const { document } = parseHTML(`<body>${html}</body>`);
  const images: ArticleImage[] = [];
  const seen = new Set<string>();

  // in document order, and one entry per <picture> however many sources it has
  for (const el of document.querySelectorAll("picture, img")) {
    if (el.tagName === "IMG" && el.closest("picture")) continue;

    const url = bestUrl(el as Element, baseUrl);
    if (!url || seen.has(url)) continue;
    if (tooSmall(el as Element)) continue;
    seen.add(url);

    // a <picture> carries no alt of its own; it belongs to the <img> inside
    const described = imgOf(el as Element);

    images.push({
      url,
      alt: described ? text(attr(described, "alt")) : null,
      caption: caption(el as Element),
    });

    if (images.length >= MAX_IMAGES) break;
  }

  return images;
}

/**
 * The largest version the markup offers. A `srcset` is preferred over `src`
 * precisely because a lazy-loading page puts its placeholder in `src`.
 */
function bestUrl(el: Element, baseUrl: string): string | null {
  const candidates: { url: string; width: number }[] = [];

  const sources =
    el.tagName === "PICTURE"
      ? [...el.querySelectorAll("source, img")]
      : [el as unknown as Element];

  for (const source of sources) {
    for (const candidate of parseSrcset(attr(source as Element, "srcset"))) {
      candidates.push(candidate);
    }
    const src = attr(source as Element, "src");
    if (src) candidates.push({ url: src, width: 0 });
  }

  // widest wins; a bare src (width 0) is the last resort
  candidates.sort((a, b) => b.width - a.width);

  for (const candidate of candidates) {
    const absolute = toAbsolute(candidate.url, baseUrl);
    if (absolute) return absolute;
  }
  return null;
}

/** `url 320w, url 640w` — or `url 1x, url 2x`, or just a url. */
function parseSrcset(value: string | null): { url: string; width: number }[] {
  if (!value) return [];

  return value
    .split(",")
    .map((entry) => {
      const [url, descriptor] = entry.trim().split(/\s+/, 2);
      if (!url) return null;

      const width = /^(\d+)w$/.exec(descriptor ?? "")?.[1];
      // a density descriptor has no pixel width, but 2x beats 1x
      const density = /^([\d.]+)x$/.exec(descriptor ?? "")?.[1];

      return {
        url,
        width: width ? Number(width) : density ? Number(density) : 1,
      };
    })
    .filter((c): c is { url: string; width: number } => c !== null);
}

function toAbsolute(url: string, baseUrl: string): string | null {
  const trimmed = url.trim();
  // an inline image is already downloaded, which is the thing we are avoiding
  if (!trimmed || /^data:/i.test(trimmed)) return null;
  if (PLACEHOLDER.test(trimmed)) return null;

  try {
    const resolved = new URL(trimmed, baseUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return null;
    }
    return resolved.href;
  } catch {
    return null;
  }
}

/** The element actually describing the picture: the <img>, wrapped or not. */
function imgOf(el: Element): Element | null {
  return el.tagName === "PICTURE"
    ? (el.querySelector("img") as Element | null)
    : el;
}

/** Only what the markup declares — measuring for real would mean fetching. */
function tooSmall(el: Element): boolean {
  const img = imgOf(el);
  if (!img) return false;

  for (const name of ["width", "height"]) {
    const value = Number(attr(img, name));
    if (Number.isFinite(value) && value > 0 && value < MIN_DIMENSION) {
      return true;
    }
  }
  return false;
}

function caption(el: Element): string | null {
  const figure = el.closest("figure");
  return text(figure?.querySelector("figcaption")?.textContent ?? null);
}

function attr(el: Element, name: string): string | null {
  // linkedom keeps the author's casing, and srcSet is written both ways
  return (
    el.getAttribute(name) ??
    el.getAttribute(name.toLowerCase()) ??
    el.getAttribute(name === "srcset" ? "srcSet" : name)
  );
}

function text(value: string | null): string | null {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : null;
}
