import { FetchValidators, readCapped, requestDocument } from "../http";
import { toAbsoluteUrl } from "./utils";

const HTML_LIMIT = 200_000;

export type PageSnapshot = {
  html: string;
  hrefs: string[];
};

export type { FetchValidators };

export type FetchPageResult =
  | { notModified: true }
  | (PageSnapshot & { notModified: false } & FetchValidators);

/**
 * Download a page and strip it down to what the model needs to see. When
 * `validators` are supplied and the server says 304, nothing is downloaded.
 */
export async function fetchPage(
  url: string,
  validators?: FetchValidators,
): Promise<FetchPageResult> {
  const res = await requestDocument(url, {
    accept: "text/html,application/xhtml+xml",
    allowedTypes: /text\/html|application\/xhtml\+xml|text\/plain/i,
    validators,
  });

  if (res.status === 304) {
    return { notModified: true };
  }

  const rawHtml = await readCapped(res);
  const cleanedHtml = cleanHtml(rawHtml);
  const baseUrl = new URL(url);

  return {
    notModified: false,
    html: cleanedHtml.slice(0, HTML_LIMIT),
    hrefs: toAbsoluteUrl(extractHrefs(cleanedHtml), baseUrl.origin),
    etag: res.headers.get("etag"),
    lastModified: res.headers.get("last-modified"),
  };
}

function cleanHtml(html: string) {
  const stripped = (html.match(/<body[\s\S]*?<\/body>/i)?.[0] ?? html)
    // Postgres rejects NUL in a text column, so a page carrying one used to
    // fail every fetch for good ("invalid byte sequence for encoding UTF8")
    .replace(/\u0000/g, "")
    // Remove non-content tags
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    // Remove non-content self-closing tags
    .replace(
      /<(meta|link|input|button|iframe|source|video|audio)\b[^>]*\/?>/gi,
      "",
    );

  return (
    stripAttributes(stripped)
      // Remove empty tags and whitespace
      .replace(/<([a-z][a-z0-9]*)>\s*<\/\1>/gi, "")
      .replace(/\s{2,}/g, " ")
  );
}

/** The only attributes the extraction prompt can actually act on. */
const KEEP_ATTRS = new Set(["href", "src", "alt"]);

const TAG_RE = /<([a-z][a-z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const ATTR_RE = /([a-zA-Z_:][-\w:.]*)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/g;

/**
 * Keep href/src/alt, drop everything else. Attributes are ~43% of a cleaned
 * page, and the model only ever needs links, images and their alt text.
 */
function stripAttributes(html: string): string {
  return html.replace(TAG_RE, (_match, tag: string, attrs: string) => {
    if (!attrs.trim()) return `<${tag}>`;

    const kept: string[] = [];
    ATTR_RE.lastIndex = 0;
    let attr: RegExpExecArray | null;

    while ((attr = ATTR_RE.exec(attrs)) !== null) {
      const name = attr[1]!.toLowerCase();
      if (!KEEP_ATTRS.has(name)) continue;

      const raw = attr[2]!;
      const value = raw.startsWith('"')
        ? raw.slice(1, -1)
        : raw.startsWith("'")
          ? raw.slice(1, -1)
          : raw;

      // inline images are huge and tell the model nothing
      if (/^data:/i.test(value)) continue;

      kept.push(`${name}="${value}"`);
    }

    return kept.length ? `<${tag} ${kept.join(" ")}>` : `<${tag}>`;
  });
}

function extractHrefs(html: string): string[] {
  const links: string[] = [];
  const re = /<a\s+[^>]*href="([^"]*)"[^>]*>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const m = match?.[1]?.trim();
    if (m) {
      links.push(m);
    }
  }
  // Return unique links
  return Array.from(new Set(links));
}
