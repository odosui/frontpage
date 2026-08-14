export type Article = {
  title: string;
  url: string;
  image: string;
  new?: boolean;
};

/** Sources we know how to pull from. Only `web` is implemented so far. */
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
};
