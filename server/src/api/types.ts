export type Article = {
  title: string;
  url: string;
  image: string;
  publishedAt?: string | null;
  description?: string;
  /**
   * The body as the feed gave it, where the feed gave one. Usually a teaser —
   * The Verge's ends "Read the full story at The Verge" — so it is not the
   * article's text and is only used when the page itself cannot be read. Null
   * when the feed carried nothing beyond its summary.
   */
  feedContent?: string | null;
  /**
   * Who published it, when that differs from the source that delivered it —
   * a link posted to reddit is nature.com's article, carried by the subreddit.
   * Null when the source's own name already says it.
   */
  publisher?: string | null;
  /** Where it was posted, when it reached us by being posted: the permalink. */
  viaUrl?: string | null;
};

/**
 * Kinds of source we know how to pull from. `web`, `rss` and `reddit` are
 * implemented.
 */
export const SOURCE_KINDS = [
  "web",
  "rss",
  "reddit",
  "telegram",
  "twitter",
] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number];

/**
 * Per-source settings. One bag rather than a column per kind: only reddit
 * reads `minScore`, and the kinds still to come will each want something of
 * their own that means nothing to the others.
 */
export type SourceConfig = {
  /** reddit: the karma a post must have before it is worth storing. */
  minScore?: number;
};

/**
 * A place we pull headlines from. Sources belong to nobody: any number of
 * dashboards may read the same one, and it is fetched once for all of them.
 */
export type Source = {
  id: string;
  name: string;
  kind: SourceKind;
  url: string;
  config: SourceConfig;
  fetchedAt: string | null;
  /** How many articles we hold from it, across every dashboard. */
  articleCount: number;
  /** How many dashboards read it. */
  dashboardCount: number;
};

/** An article as the feed shows it: with the source it came from. */
export type FeedArticle = Article & {
  /** The database id — what an extract_content job is queued against. */
  id: number;
  /** Null for an article that reached us without a source of its own. */
  sourceId: string | null;
  createdAt: string;
  /** Whether its text has been pulled from the page yet. */
  hasContent: boolean;
  /** This dashboard has not filed it yet: no story, and not skipped. */
  uncategorized: boolean;
  /** 1-10, as this dashboard's categorizing agent scored it; null until it ran. */
  importance: number | null;
  /** Broadest first; empty until the article has been categorized. */
  tags: string[];
};

/** One story with the articles this dashboard filed under it. */
export type StoryFeedEntry = {
  id: number;
  title: string;
  slug: string;
  /** The story's newest article — what the list is sorted by. */
  updatedAt: string;
  articles: FeedArticle[];
};
