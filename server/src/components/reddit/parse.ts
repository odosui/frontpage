import { Article } from "../../api/types";

/** One post, as the listing returns it. Only the fields we actually read. */
export type RedditPost = {
  id?: string;
  title?: string;
  score?: number;
  /** True for a text post: the discussion is the content, not a link. */
  is_self?: boolean;
  /** Where the post points. For a self post, back at reddit. */
  url?: string;
  permalink?: string;
  domain?: string;
  created_utc?: number;
  selftext?: string;
  stickied?: boolean;
  over_18?: boolean;
  /** Set on posts reddit has removed; they keep appearing in listings. */
  removed_by_category?: string | null;
};

export type RedditListing = {
  data?: { children?: { data?: RedditPost }[] };
};

export const DEFAULT_MIN_SCORE = 20;

/** Where a reddit link actually points, when it points off reddit. */
const REDDIT_HOSTS = /(^|\.)(reddit\.com|redd\.it)$/i;

export function parseListing(body: unknown): RedditPost[] {
  const listing = body as RedditListing;
  const children = listing?.data?.children;
  if (!Array.isArray(children)) {
    throw new Error("reddit listing had no children array");
  }
  return children.map((c) => c?.data ?? {}).filter((p) => p.title);
}

export type RedditArticle = Article & {
  /** The post's permalink — the discussion, as opposed to the article. */
  viaUrl: string;
  /** Who published it, when that is not reddit. */
  publisher: string | null;
  score: number;
};

/**
 * Turns posts into articles, keeping only what cleared the bar.
 *
 * A link post becomes the article it points at: the destination's url, so the
 * text extractor reads the piece rather than the thread around it, and the
 * destination's host as the publisher. A self post has no destination, so it
 * stays a reddit article and its own text becomes the description.
 *
 * The permalink is kept either way — for a link post it is the one thing that
 * would otherwise be lost, and the comments are frequently worth more than the
 * article.
 */
export function toArticles(
  posts: RedditPost[],
  minScore: number,
): RedditArticle[] {
  const articles: RedditArticle[] = [];

  for (const post of posts) {
    const title = post.title?.trim();
    if (!title) continue;

    // Pinned mod posts are furniture, not news, and they always clear the
    // score bar. Removed posts keep their title and lead nowhere.
    if (post.stickied || post.removed_by_category) continue;
    if (post.over_18) continue;

    const score = post.score ?? 0;
    if (score < minScore) continue;

    const permalink = post.permalink
      ? `https://www.reddit.com${post.permalink}`
      : "";
    const link = (post.url ?? "").trim();
    const external = !post.is_self && link ? offReddit(link) : null;

    // a link post with no usable destination is just a discussion
    const url = external ?? permalink;
    if (!url) continue;

    const description = post.selftext?.trim();

    articles.push({
      title,
      url,
      image: "",
      viaUrl: permalink,
      publisher: external ? hostOf(external) : null,
      score,
      ...(post.created_utc
        ? { publishedAt: new Date(post.created_utc * 1000).toISOString() }
        : {}),
      ...(description ? { description } : {}),
    });
  }

  return articles;
}

/** The url if it leads off reddit, otherwise nothing. */
function offReddit(link: string): string | null {
  try {
    const host = new URL(link).hostname;
    return REDDIT_HOSTS.test(host) ? null : link;
  } catch {
    return null;
  }
}

export function hostOf(link: string): string | null {
  try {
    return new URL(link).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/**
 * The subreddit behind whatever the reader typed: a full url, `/r/futurology`,
 * `r/futurology` or the bare name all resolve to `futurology`.
 */
export function subredditOf(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/r\/([A-Za-z0-9_]+)/);
  if (match) return match[1]!;
  return trimmed.replace(/^\/+|\/+$/g, "");
}
