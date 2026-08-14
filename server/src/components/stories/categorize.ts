import { Usage, sendMessageWithUsage } from "../ai/OpenRouter";
import { query } from "../../db/pool";
import { PromptArticle, categorizeStoriesPrompt } from "./prompt";

export type RecentArticle = PromptArticle & {
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

/**
 * Newest articles across every dashboard. Ids are renumbered 1..n for the
 * prompt so the model never has to echo six-digit database ids back.
 */
export async function recentArticles(limit: number): Promise<RecentArticle[]> {
  const { rows } = await query<{
    title: string;
    url: string;
    dashboard_id: string;
    channel_id: string;
    created_at: Date;
  }>(
    `select title, url, dashboard_id, channel_id, created_at
     from articles
     order by created_at desc, id desc
     limit $1`,
    [limit],
  );

  return rows.map((r, i) => ({
    id: i + 1,
    title: r.title,
    url: r.url,
    source: hostname(r.url) || r.channel_id,
    dashboardId: r.dashboard_id,
    channelId: r.channel_id,
    publishedAt: new Date(r.created_at).toISOString().slice(0, 16).replace("T", " "),
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
