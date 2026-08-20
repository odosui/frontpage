export type Article = {
  title: string;
  url: string;
  image: string;
  publishedAt?: string | null;
  description?: string;
};

/** Kinds of source we know how to pull from. `web` and `rss` are implemented. */
export const SOURCE_KINDS = ["web", "rss", "telegram", "twitter"] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number];

/**
 * A place we pull headlines from. Sources belong to nobody: any number of
 * dashboards may read the same one, and it is fetched once for all of them.
 */
export type Source = {
  id: string;
  name: string;
  kind: SourceKind;
  url: string;
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
  sourceId: string;
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
