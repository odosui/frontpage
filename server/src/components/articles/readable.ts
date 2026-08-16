import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { htmlToText } from "../../utils/html";
import { ArticleImage, extractImages } from "./images";

/**
 * Pulling the article out of the page it is buried in, with no model involved.
 *
 * This is Firefox's Reader Mode algorithm — Mozilla's Readability, scoring
 * every block by how much prose-shaped text it holds against how much markup
 * and navigation surrounds it. That is why it generalises: it never learns a
 * site, it just finds the densest run of paragraphs. The dom it needs comes
 * from linkedom rather than jsdom, which is an order of magnitude lighter and
 * enough for a parse we throw away immediately.
 *
 * What it cannot do is run javascript, so a page that ships an empty shell and
 * fetches its own text (and a paywall, and an interstitial) yields nothing —
 * hence the length floor below, which turns "I found the nav bar" into a
 * failure the job can report rather than a row of junk in the database.
 */

/**
 * How much prose a page must hold to count as an article — measured over its
 * long paragraphs only, not its total length.
 *
 * Total length is the obvious test and the wrong one. Strip the headline list
 * off a section index and what remains is the site's "about us" blurb plus a
 * column of one-line footer links, which on Ars Technica comes to 310
 * characters of nothing. Counting only paragraphs that are themselves
 * paragraph-length throws that away and keeps a short news brief.
 */
const MIN_PROSE_CHARS = 400;

/** A line shorter than this is a link, a caption or a heading, not prose. */
const MIN_PARAGRAPH_CHARS = 100;

/**
 * Accept Readability's first, strict pass at anything this long. Left to its
 * default it retries with permissive flags whenever the first pass comes back
 * short, and on a page with no article the second attempt simply swallows the
 * footer — a worse answer that is harder to reject.
 */
const READABILITY_THRESHOLD = 250;

/** Longer than any real article; a runaway page shouldn't fill a text column. */
const MAX_CHARS = 400_000;

export type ReadableArticle = {
  /** The page's own headline, which is often better than the feed's. */
  title: string | null;
  byline: string | null;
  /** When the page says it was published, if it says at all. */
  publishedAt: string | null;
  /** The article body as plain text, paragraphs kept. */
  text: string;
  /** Pictures inside the body, as urls to the publisher's own copies. */
  images: ArticleImage[];
};

export class UnreadableError extends Error {}

/**
 * Read `html` as an article. Throws `UnreadableError` when the page holds no
 * readable body — a section index, a paywall, a js shell — so the caller can
 * tell that apart from a download that failed.
 */
export function extractReadable(html: string, url: string): ReadableArticle {
  // Readability walks and mutates the tree, so it gets its own parse
  const { document } = parseHTML(html);

  const parsed = new Readability(document as never, {
    charThreshold: READABILITY_THRESHOLD,
  }).parse();

  if (!parsed) {
    throw new UnreadableError(`no readable article found at ${url}`);
  }

  const text = htmlToText(parsed.content ?? "").slice(0, MAX_CHARS);
  const prose = proseLength(text);

  if (prose < MIN_PROSE_CHARS) {
    throw new UnreadableError(
      `only ${prose} characters of prose at ${url} (${text.length} total) — ` +
        `the page is probably a section index, a paywall, or needs javascript`,
    );
  }

  return {
    images: extractImages(parsed.content ?? "", url),
    title: clean(parsed.title),
    byline: clean(parsed.byline),
    publishedAt: publishedAt(parsed.publishedTime),
    text,
  };
}

/** How much of the text is in paragraphs long enough to be prose. */
function proseLength(text: string): number {
  return text
    .split("\n")
    .filter((line) => line.length >= MIN_PARAGRAPH_CHARS)
    .reduce((total, line) => total + line.length, 0);
}

/** Readability hands back "" as readily as null, and neither is a value. */
function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Same guard as the feed parser: a wrong date is worse than none. */
function publishedAt(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) return null;

  const years = Math.abs(at.getTime() - Date.now()) / 31_536_000_000;
  return years > 30 ? null : at.toISOString();
}
