import { Article } from "../../api/types";

/**
 * A feed already says what a front page only implies: these are the articles,
 * this is the title, this is the link. So there is no model call here and no
 * hallucinated-link filtering to undo — the structure is the answer.
 *
 * Handles RSS 2.0 (`<item>`) and Atom (`<entry>`), which is what publishers
 * actually serve. Parsed with regexes rather than a dependency: we only need
 * four fields, and feeds in the wild are too malformed for a strict parser to
 * be an advantage.
 */

const ITEM_RE = /<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;

/** A summary is context, not content — long enough to be useful, no more. */
const DESCRIPTION_LIMIT = 1000;

export function parseFeed(xml: string, feedUrl: string): Article[] {
  const articles: Article[] = [];
  const seen = new Set<string>();

  ITEM_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ITEM_RE.exec(xml)) !== null) {
    const item = match[2] ?? "";

    const title = decode(tag(item, "title"));
    const url = absolute(link(item), feedUrl);
    if (!title || !url || seen.has(url)) continue;
    seen.add(url);

    articles.push({
      title,
      url,
      image: image(item) ?? "",
      publishedAt: published(item),
      description: description(item),
    });
  }

  return articles;
}

/**
 * When the publisher says it went out. RSS writes RFC 822 in `<pubDate>`, Atom
 * ISO 8601 in `<published>`, and plenty of feeds carry only `<dc:date>` or
 * `<updated>`. Anything unparseable, or absurdly far from now, is dropped
 * rather than stored — a wrong date is worse than none.
 */
function published(item: string): string | null {
  for (const name of ["pubDate", "published", "date", "updated"]) {
    const raw = tag(item, name);
    if (!raw) continue;

    const at = new Date(raw);
    if (Number.isNaN(at.getTime())) continue;

    const years = Math.abs(at.getTime() - Date.now()) / 31_536_000_000;
    if (years > 30) continue;

    return at.toISOString();
  }
  return null;
}

/**
 * The feed's own summary. Publishers put markup, tracking pixels and whole
 * articles in here, so it is stripped to plain text and capped — what we want
 * is a sentence of context, not a copy of the page.
 */
function description(item: string): string {
  const raw =
    tag(item, "description") ||
    tag(item, "summary") ||
    tag(item, "subtitle") ||
    // last resort, and only because some publishers ship an empty
    // <description> and put everything in the body: The Insider sends
    // <description><![CDATA[]]></description> on 45 of 50 items. The opening
    // of an article is a worse summary than a written one, but it beats none.
    tag(item, "encoded") ||
    tag(item, "content");
  if (!raw) return "";

  const text = decode(
    raw
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= DESCRIPTION_LIMIT) return text;
  // cut on a word boundary so the tail is not a half word
  const cut = text.slice(0, DESCRIPTION_LIMIT);
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** The text of the first `<name>` at any depth, CDATA unwrapped. */
function tag(item: string, name: string): string {
  const re = new RegExp(
    `<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`,
    "i",
  );
  const raw = re.exec(item)?.[1] ?? "";
  const cdata = /<!\[CDATA\[([\s\S]*?)\]\]>/i.exec(raw);
  return (cdata ? cdata[1]! : raw).trim();
}

/** An attribute off the first matching tag, e.g. the href on Atom's `<link>`. */
function attr(item: string, tagName: string, name: string): string | null {
  const re = new RegExp(`<(?:\\w+:)?${tagName}\\s([^>]*)>`, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(item)) !== null) {
    const attrs = match[1] ?? "";
    // Atom feeds carry several links per entry; the alternate is the article,
    // the others are comment feeds, enclosures and self-references
    if (tagName === "link" && /rel\s*=\s*["'](?!alternate)/i.test(attrs)) {
      continue;
    }
    const value = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(
      attrs,
    )?.[1];
    if (value) return decode(value.trim());
  }
  return null;
}

/**
 * RSS puts the url in `<link>`'s text, Atom in its href attribute. `<guid>` is
 * the last resort: it is only a link when the publisher says it is one, but
 * `isPermaLink` defaults to true when the tag is absent.
 */
function link(item: string): string {
  const text = decode(tag(item, "link"));
  if (text) return text;

  const href = attr(item, "link", "href");
  if (href) return href;

  const guid = tag(item, "guid");
  if (guid && !/isPermaLink\s*=\s*["']false["']/i.test(item)) return guid;

  return "";
}

/** Whatever the publisher offers as the item's picture, if anything. */
function image(item: string): string | null {
  const enclosure = /<enclosure\s([^>]*)>/i.exec(item)?.[1];
  if (enclosure && /type\s*=\s*["']image\//i.test(enclosure)) {
    const url = /\burl\s*=\s*["']([^"']*)["']/i.exec(enclosure)?.[1];
    if (url) return decode(url);
  }

  return (
    attr(item, "media:content", "url") ??
    attr(item, "media:thumbnail", "url") ??
    null
  );
}

/** Feeds do publish relative links, and the feed's own url is the base. */
function absolute(url: string, base: string): string {
  if (!url) return "";
  try {
    return new URL(url, base).href;
  } catch {
    return "";
  }
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Titles arrive entity-encoded, sometimes twice over (`&amp;#39;`), and a feed
 * title is displayed verbatim — so decode rather than pass the escapes through.
 */
function decode(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (whole, body: string) => {
    if (body.startsWith("#")) {
      const code = body.startsWith("#x")
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}
