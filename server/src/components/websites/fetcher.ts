import { Article } from "../../api/types";
import { sendMessage as sendOpenRouter } from "../ai/OpenRouter";
import { sendMessage as sendOpenAI } from "../ai/OpenAI";
import { sendMessage as sendAnthropic } from "../ai/Anthropic";
import { extractArticlesPrompt } from "./prompt";

export const FRONTPAGE_MODEL =
  process.env.FRONTPAGE_MODEL || "openrouter/google/gemini-3.6-flash";

function parseModel(value: string): { provider: string; model: string } {
  const slash = value.indexOf("/");
  if (slash === -1) {
    throw new Error(
      `FRONTPAGE_MODEL must be prefixed with a provider, e.g. "openai/gpt-5.4-nano" or "openrouter/google/gemini-3.6-flash"`,
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

export type PageSnapshot = {
  /** Cleaned and cropped page html, ready for the model. */
  html: string;
  /** Every real link on the page, absolute — used to catch hallucinations. */
  hrefs: string[];
};

/** Download a page and strip it down to what the model needs to see. */
export async function fetchPage(url: string): Promise<PageSnapshot> {
  const rawHtml = await fetchUrlHtml(url);
  const cleanedHtml = cleanHtml(rawHtml);
  const baseUrl = new URL(url);

  return {
    html: cleanedHtml.slice(0, HTML_LIMIT),
    hrefs: toAbsoluteUrl(extractHrefs(cleanedHtml), baseUrl.origin),
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

async function fetchUrlHtml(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Frontpage-Bot/1.0 (+https://github.com/odosui/frontpage)",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`fetch ${url} returned ${res.status} ${res.statusText}`);
  }
  return res.text();
}

function cleanHtml(html: string) {
  return (
    (html.match(/<body[\s\S]*?<\/body>/i)?.[0] ?? html)
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
      )
      // Strip all attributes except href and src
      .replace(
        /\s+(?:class|id|style|role|tabindex|loading|decoding|fetchpriority|sizes|srcset|width|height|data-[a-z0-9-]*|aria-[a-z0-9-]*)="[^"]*"/gi,
        "",
      )
      // Remove empty tags and whitespace
      .replace(/<([a-z][a-z0-9]*)>\s*<\/\1>/gi, "")
      .replace(/\s{2,}/g, " ")
  );
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
