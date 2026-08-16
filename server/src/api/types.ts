export type Article = {
  title: string;
  url: string;
  image: string;
  new?: boolean;
  publishedAt?: string | null;
  description?: string;
};

/** Sources we know how to pull from. `web` and `rss` are implemented so far. */
export const CHANNEL_KINDS = ["web", "rss", "telegram", "twitter"] as const;

export type ChannelKind = (typeof CHANNEL_KINDS)[number];

export type Channel = {
  id: string;
  kind: ChannelKind;
  url: string;
};

/** An article as the feed shows it: with the channel it came from. */
export type FeedArticle = Article & {
  channelId: string;
  createdAt: string;
  /** 1-10, as scored by the categorizing agent; null until it has run. */
  importance: number | null;
  /** Broadest first; empty until the article has been categorized. */
  tags: string[];
};

/**
 * One story with the articles under it. The storyline is only a label here —
 * the same one can head several entries, since the list is ordered by story,
 * not grouped by arc.
 */
export type StoryFeedEntry = {
  id: number;
  title: string;
  slug: string;
  storyline: { id: number; title: string; slug: string } | null;
  /** The story's newest article — what the list is sorted by. */
  updatedAt: string;
  articles: FeedArticle[];
};
