import { Article } from "../../api/types";
import { sendMessage as sendOpenRouter } from "../ai/OpenRouter";
import { sendMessage as sendOpenAI } from "../ai/OpenAI";
import { sendMessage as sendAnthropic } from "../ai/Anthropic";
import { extractArticlesPrompt } from "./prompt";

export const FRONTPAGE_MODEL =
  process.env.FRONTPAGE_MODEL || "openrouter/google/gemini-3.1-flash-lite";

function parseModel(value: string): { provider: string; model: string } {
  const slash = value.indexOf("/");
  if (slash === -1) {
    throw new Error(
      `FRONTPAGE_MODEL must be prefixed with a provider, e.g. "openai/gpt-5.4-nano" or "openrouter/google/gemini-3.1-flash-lite"`,
    );
  }
  const provider = value.slice(0, slash);
  const model = value.slice(slash + 1);
  return { provider, model };
}

function getSendMessage() {
  const { provider, model } = parseModel(FRONTPAGE_MODEL);
  switch (provider) {
    case "openai":
      return { send: sendOpenAI, model };
    case "openrouter":
      return { send: sendOpenRouter, model };
    case "anthropic":
      return { send: sendAnthropic, model };
    default:
      throw new Error(`Unknown provider "${provider}" in FRONTPAGE_MODEL`);
  }
}

const HTML_LIMIT = 200_000;
/** Stop reading a response past this much decompressed html. */
const MAX_DOWNLOAD_BYTES = 3_000_000;

export type PageSnapshot = {
  html: string;
  hrefs: string[];
};

/** HTTP validators, so the next fetch can ask for a 304 instead of a body. */
export type FetchValidators = {
  etag?: string | null;
  lastModified?: string | null;
};

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
  const res = await requestPage(url, validators);

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

/** Ask the model for the articles on an already-fetched page. */
export async function analyzePage(
  url: string,
  snapshot: PageSnapshot,
): Promise<Article[]> {
  const baseUrl = new URL(url);

  const { send, model } = getSendMessage();
  const aiResp = await send(
    model,
    extractArticlesPrompt(baseUrl.origin, snapshot.html),
  );

  const jsonMatch = aiResp.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("failed to parse AI response");
  }

  const articles: Article[] = JSON.parse(jsonMatch[0]);

  // exclude hallucinated links
  const filtered = filterByRealLinks(articles, snapshot.hrefs);

  // make sure the order matches the order of links on the page
  return fixOrder(filtered, snapshot.hrefs);
}

async function requestPage(
  url: string,
  validators?: FetchValidators,
): Promise<Response> {
  const headers: Record<string, string> = {
    "User-Agent": "Frontpage-Bot/1.0 (+https://github.com/odosui/frontpage)",
    Accept: "text/html,application/xhtml+xml",
  };
  if (validators?.etag) headers["If-None-Match"] = validators.etag;
  if (validators?.lastModified) {
    headers["If-Modified-Since"] = validators.lastModified;
  }

  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 304) return res;

  if (!res.ok) {
    throw new Error(`fetch ${url} returned ${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (
    contentType &&
    !/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)
  ) {
    throw new Error(`fetch ${url} returned non-html content (${contentType})`);
  }

  return res;
}

/**
 * Read the body but stop at MAX_DOWNLOAD_BYTES — a runaway page shouldn't be
 * able to exhaust memory, and we only ever look at the first slice anyway.
 */
async function readCapped(res: Response): Promise<string> {
  const charset =
    /charset=([\w-]+)/i.exec(res.headers.get("content-type") ?? "")?.[1] ??
    "utf-8";

  if (!res.body) return res.text();

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (total < MAX_DOWNLOAD_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => undefined);

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }

  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

function cleanHtml(html: string) {
  const stripped = (html.match(/<body[\s\S]*?<\/body>/i)?.[0] ?? html)
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

function filterByRealLinks(articles: Article[], hrefs: string[]): Article[] {
  const realLinks = new Set(hrefs);
  let hallucinated = 0;

  const filtered = articles.filter((a) => {
    try {
      const parsed = new URL(a.url);
      if (parsed.pathname === "/" && parsed.search === "") return false;
    } catch {
      return false;
    }

    if (!realLinks.has(a.url)) {
      console.log(`[analyze] filtered out AI-hallucinated link: ${a.url}`);
      hallucinated++;
      return false;
    }

    return true;
  });

  if (hallucinated > 0) {
    console.log(
      `[analyze] ${hallucinated} hallucinated link(s) out of ${articles.length} total`,
    );
  }

  return filtered;
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

function toAbsoluteUrl(hrefs: string[], baseUrl: string) {
  return hrefs
    .map((href) => {
      try {
        return new URL(href, baseUrl).href;
      } catch {
        return null;
      }
    })
    .filter((url): url is string => !!url);
}

function fixOrder(articles: Article[], hrefs: string[]): Article[] {
  const hrefIndex = new Map(hrefs.map((href, i) => [href, i]));
  return [...articles].sort(
    (a, b) =>
      (hrefIndex.get(a.url) ?? Infinity) - (hrefIndex.get(b.url) ?? Infinity),
  );
}
