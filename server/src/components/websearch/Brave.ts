/**
 * Brave Search — the web-facing counterpart to the tools that only ever see
 * our own tables. An agent that needs something we never ingested (who a name
 * belongs to, what happened after the article was written) has to leave the
 * database, and this is the only door out.
 */

const BRAVE_API_URL = "https://api.search.brave.com/res/v1/web/search";

/** Brave caps `count` at 20 per request, and rejects anything above it. */
const MAX_COUNT = 20;

const DEFAULT_COUNT = 10;

/**
 * Brave returns up to 5 excerpts per result. All of them, across a full page of
 * results, is a wall of text an agent has to read before it can do anything —
 * the first few are the ones the query actually matched.
 */
const MAX_SNIPPETS = 3;

const TIMEOUT_MS = Number(process.env.FRONTPAGE_SEARCH_TIMEOUT_MS) || 15_000;

export type SearchResult = {
  title: string;
  url: string;
  /** Brave's snippet. Contains <strong> around matched terms, stripped here. */
  description: string;
  /**
   * When the article was published, as Brave's own text ("Jul 22, 2026").
   * Distinct from `age`: a page that is edited long after it is written reports
   * a recent age and an old date, so this is the honest one for news.
   */
  date?: string | undefined;
  /** The outlet, by its full name ("BBC News") rather than its domain. */
  publisher?: string | undefined;
  /**
   * Longer excerpts from the body — several sentences each, where `description`
   * is one line. Most of what the page says, without fetching the page.
   */
  extraSnippets: string[];
  /**
   * How long ago Brave last saw the page *change* ("2 days ago"). Kept as the
   * fallback for anything with no publish date, not as a publication time.
   */
  age?: string | undefined;
};

export type SearchOptions = {
  /** How many results to ask for; clamped to Brave's own ceiling of 20. */
  count?: number;
  /**
   * Restrict to recent results: `pd` past day, `pw` past week, `pm` past month,
   * `py` past year, or a `YYYY-MM-DDtoYYYY-MM-DD` range.
   */
  freshness?: string;
  /** Two-letter market, e.g. `us`. Brave defaults to `us` when omitted. */
  country?: string;
  /**
   * Two-letter language of the *content*, e.g. `ru`. Brave defaults to `en`,
   * which hides a story's local coverage behind whatever the anglophone press
   * picked up.
   */
  searchLang?: string;
};

type BraveWebResult = {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
  page_age?: string;
  extra_snippets?: string[];
  article?: {
    date?: string;
    publisher?: { name?: string };
  };
  profile?: { long_name?: string; name?: string };
};

/**
 * One web search. Returns [] for a query Brave has nothing for — an empty
 * result set is an answer, not a failure — and throws only when the call
 * itself failed, so a caller can tell "nothing found" from "search is down".
 */
export async function search(
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    throw new Error("BRAVE_SEARCH_API_KEY environment variable is not set");
  }

  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({
    q: trimmed,
    count: String(clampCount(options.count)),
    // We aggregate war reporting, and Brave's default `moderate` is free to
    // hold back exactly that. Not a caller's choice: a filtered news feed is
    // never what this system wants.
    safesearch: "off",
    // Only the web results are read downstream; without this the response also
    // carries infobox, video and mixed blocks nobody looks at.
    result_filter: "web",
  });
  if (options.freshness) params.set("freshness", options.freshness);
  if (options.country) params.set("country", options.country);
  if (options.searchLang) params.set("search_lang", options.searchLang);

  const res = await fetch(`${BRAVE_API_URL}?${params}`, {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.error?.detail || body?.error?.code || "";
    throw new Error(
      `Brave Search API error (${res.status} ${res.statusText}): ${detail}`.trim(),
    );
  }

  const json = await res.json();
  const results: BraveWebResult[] = json?.web?.results ?? [];

  return results.filter((r) => r.url && r.title).map(toResult);
}

function clampCount(count: number | undefined): number {
  if (!Number.isFinite(count) || (count ?? 0) <= 0) return DEFAULT_COUNT;
  return Math.min(Math.floor(count!), MAX_COUNT);
}

function toResult(raw: BraveWebResult): SearchResult {
  const publisher = raw.article?.publisher?.name ?? raw.profile?.long_name;

  return {
    title: clean(raw.title ?? ""),
    url: raw.url!,
    description: clean(raw.description ?? ""),
    date: raw.article?.date ?? isoDate(raw.page_age),
    publisher: publisher ? clean(publisher) : undefined,
    extraSnippets: (raw.extra_snippets ?? []).map(clean).filter(Boolean),
    age: raw.age ?? undefined,
  };
}

/** `2026-08-11T23:30:49` is a timestamp of a crawl; only the day is meaningful. */
function isoDate(pageAge: string | undefined): string | undefined {
  return pageAge?.slice(0, 10);
}

/**
 * Snippets come back as html: Brave wraps the matched terms in <strong>, and
 * escapes the rest. Everything downstream is plain text — a prompt, a log —
 * so it gets unwrapped here rather than at each call site.
 */
function clean(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    // Numeric entities come in both forms — Brave writes apostrophes as
    // `&#x27;` in descriptions — so they are decoded by code point rather
    // than one spelling at a time.
    .replace(/&#(\d+);/g, (_, dec: string) => codePoint(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      codePoint(parseInt(hex, 16)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** A malformed entity yields nothing rather than throwing on a bad code point. */
function codePoint(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return "";
  return String.fromCodePoint(n);
}

/**
 * The compact rendering an agent reads: one result per block, no json. The
 * header carries publisher and publish date because both are things the agent
 * would otherwise have to infer from the url and the prose.
 */
export function formatResults(results: SearchResult[]): string {
  if (results.length === 0) return "(no results)";

  return results.map(formatResult).join("\n\n");
}

function formatResult(r: SearchResult): string {
  // Outlets that append their own name to every headline would otherwise be
  // named twice in the same line.
  const publisher =
    r.publisher && !r.title.toLowerCase().includes(r.publisher.toLowerCase())
      ? r.publisher
      : undefined;
  const attribution = [publisher, r.date ?? r.age].filter(Boolean).join(", ");
  const head = attribution ? `${r.title} (${attribution})` : r.title;

  // The one-line description is usually the first extra snippet in shorter
  // form, so it is dropped when the fuller excerpts are there.
  const body =
    r.extraSnippets.length > 0
      ? r.extraSnippets
          .slice(0, MAX_SNIPPETS)
          .map((s) => `- ${s}`)
          .join("\n")
      : r.description;

  return `${head}\n${r.url}\n${body}`;
}
