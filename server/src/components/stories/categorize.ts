import * as articles from "../../models/articles";
import { outermostObject } from "../../utils/jsonObject";
import { PromptArticle } from "./prompt";

export type RecentArticle = PromptArticle & {
  /** The real articles.id, as opposed to the 1..n id used in the prompt. */
  articleId: number;
  url: string;
  dashboardId: string;
  sourceId: string;
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

/**
 * The model's whole answer: the events it found in the batch, and the articles
 * it judged not to belong to this dashboard at all.
 */
export type StoryTree = {
  stories: Story[];
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
    source: hostname(r.url) || r.sourceId,
    dashboardId,
    sourceId: r.sourceId,
    // the real publish time where the source gave us one; otherwise when we
    // first saw it, which is the only date a scraped page has
    publishedAt: r.publishedAt.slice(0, 16).replace("T", " "),
    // rss sources carry the outlet's own summary; web sources never do, so
    // the prompt has to read with it present on some articles and not others
    ...(r.description ? { description: r.description } : {}),
  }));
}

/** Models like to wrap JSON in prose or fences; take the outermost object. */
export function parseTree(raw: string): StoryTree {
  const object = outermostObject(raw);
  if (!object) {
    // what the model actually sent is the only thing that explains the
    // failure afterwards, and in production this error is all that survives
    throw new Error(`no JSON object in the model response: ${preview(raw)}`);
  }

  let parsed: StoryTree;
  try {
    parsed = JSON.parse(object) as StoryTree;
  } catch (e) {
    throw new Error(
      `the JSON in the model response does not parse: ${(e as Error).message}`,
    );
  }

  if (!Array.isArray(parsed.stories)) {
    throw new Error("response has no stories array");
  }
  return parsed;
}

/**
 * What to tell the agent when its final message was not the tree it was asked
 * for, or null when the tree is fine. A batch reaches this point having cost a
 * whole conversation, so a malformed last message is worth one more turn
 * rather than the run — every article in it stays uncategorized otherwise.
 */
export function treeComplaint(answer: string): string | null {
  try {
    parseTree(answer);
    return null;
  } catch (e) {
    return (
      `That message was your answer, and nothing in it could be filed: ` +
      `${(e as Error).message}. Nothing has been saved. Send the complete ` +
      `JSON object now — <|DONE|> and the object, no prose, no markdown ` +
      `fences, every article id from the batch appearing exactly once.`
    );
  }
}

/** Enough of a bad answer to recognise it in a log, without pasting a batch. */
function preview(raw: string): string {
  const flat = raw.replace(/\s+/g, " ").trim();
  if (!flat) return "(empty)";
  return flat.length > PREVIEW_LIMIT
    ? `${flat.slice(0, PREVIEW_LIMIT)}…`
    : flat;
}

const PREVIEW_LIMIT = 300;

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
