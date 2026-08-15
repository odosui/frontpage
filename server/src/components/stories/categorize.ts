import { Usage, sendMessageWithUsage } from "../ai/OpenRouter";
import * as articles from "../../models/articles";
import { PromptArticle, categorizeStoriesPrompt } from "./prompt";

export type RecentArticle = PromptArticle & {
  /** The real articles.id, as opposed to the 1..n id used in the prompt. */
  articleId: number;
  url: string;
  dashboardId: string;
  channelId: string;
};

/** An article as the model placed it: its prompt id plus the tags it earned. */
export type TaggedArticle = { id: number; tags: string[] };

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

export type CategorizeRun = {
  model: string;
  articles: RecentArticle[];
  tree: StoryTree;
  raw: string;
  elapsedMs: number;
  usage: Usage;
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
    publishedAt: r.createdAt.slice(0, 16).replace("T", " "),
  }));
}

export async function categorize(
  model: string,
  articles: RecentArticle[],
): Promise<CategorizeRun> {
  const started = Date.now();
  const { content: raw, usage } = await sendMessageWithUsage(
    model,
    categorizeStoriesPrompt(articles),
  );
  const elapsedMs = Date.now() - started;

  return { model, articles, tree: parseTree(raw), raw, elapsedMs, usage };
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
