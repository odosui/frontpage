import * as articles from "../../models/articles";
import { PromptArticle } from "./prompt";

export type RecentArticle = PromptArticle & {
  /** The real articles.id, as opposed to the 1..n id used in the prompt. */
  articleId: number;
  url: string;
  dashboardId: string;
  channelId: string;
};

/**
 * An article as the model placed it: its prompt id, how much it matters (1-10),
 * and the tags it earned.
 */
export type TaggedArticle = {
  id: number;
  importance?: number;
  tags: string[];
};

export type Story = { story: string; articles: TaggedArticle[] };

export type Storyline = {
  storyline: string;
  standalone?: boolean;
  stories: Story[];
};

export type StoryTree = {
  storylines: Storyline[];
  unassigned?: { article_id: number; reason: string }[];
};

/** How far back a categorizing run looks by default. */
export const DEFAULT_WINDOW_DAYS = 7;

/**
 * The batch to work on: every article in this dashboard from the last `days`
 * that no story has claimed yet, newest first. Ids are renumbered 1..n for the
 * prompt so the model never has to echo six-digit database ids back —
 * `articleId` keeps the real one for persistence. `limit` caps the batch only
 * if given.
 */
export async function uncategorizedArticles(
  dashboardId: string,
  {
    days = DEFAULT_WINDOW_DAYS,
    limit,
  }: { days?: number | undefined; limit?: number | undefined } = {},
): Promise<RecentArticle[]> {
  const rows = await articles.uncategorized(dashboardId, { days, limit });

  return rows.map((r, i) => ({
    id: i + 1,
    articleId: r.id,
    title: r.title,
    url: r.url,
    source: hostname(r.url) || r.channelId,
    dashboardId,
    channelId: r.channelId,
    // the real publish time where the channel gave us one; otherwise when we
    // first saw it, which is the only date a scraped page has
    publishedAt: r.publishedAt.slice(0, 16).replace("T", " "),
    // rss channels carry the outlet's own summary; web channels never do, so
    // the prompt has to read with it present on some articles and not others
    ...(r.description ? { description: r.description } : {}),
  }));
}

/** Models like to wrap JSON in prose or fences; take the outermost object. */
export function parseTree(raw: string): StoryTree {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("no JSON object in the model response");
  }
  const parsed = JSON.parse(match[0]) as StoryTree;
  if (!Array.isArray(parsed.storylines)) {
    throw new Error("response has no storylines array");
  }
  return parsed;
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
