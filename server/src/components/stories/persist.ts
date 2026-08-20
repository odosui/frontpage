import * as articles from "../../models/articles";
import * as stories from "../../models/stories";
import { StoryTree } from "./categorize";
import { PromptArticle } from "./prompt";

export type PersistResult = stories.SaveResult & {
  /** Prompt ids the model used that were not in the batch we sent it. */
  unknownIds: number[];
  /** Articles the model judged not to belong here; they leave the queue. */
  skipped: number;
};

/**
 * Turns a model's answer into rows. The tree talks in prompt ids (1..n), which
 * exist only inside one conversation — this maps them back to real article ids
 * before anything touches the database, and drops any id the model invented.
 */
export async function persistTree(
  dashboardId: string,
  tree: StoryTree,
  batch: (PromptArticle & { articleId: number })[],
): Promise<PersistResult> {
  const articleIds = new Map(batch.map((a) => [a.id, a.articleId]));
  const unknownIds: number[] = [];

  const entries: stories.StoryEntry[] = [];

  for (const story of tree.stories ?? []) {
    const filed: stories.StoryEntry["articles"] = [];

    for (const article of story.articles ?? []) {
      const articleId = articleIds.get(article.id);
      if (articleId === undefined) {
        unknownIds.push(article.id);
        continue;
      }
      filed.push({
        id: articleId,
        importance: clampImportance(article.importance),
        tags: article.tags ?? [],
      });
    }

    if (filed.length === 0) continue;
    entries.push({ story: cleanTitle(story.story), articles: filed });
  }

  // an article the model refused to file has to be marked, or it sits in this
  // dashboard's queue for ever: nothing files it, so every later run picks it
  // up again
  const rejected: { id: number; reason: string }[] = [];
  for (const item of tree.unassigned ?? []) {
    const articleId = articleIds.get(item.article_id);
    if (articleId === undefined) {
      unknownIds.push(item.article_id);
      continue;
    }
    rejected.push({ id: articleId, reason: item.reason ?? "" });
  }

  const saved = await stories.save(dashboardId, entries);
  const skipped = await articles.markSkipped(dashboardId, rejected);
  return { ...saved, unknownIds, skipped };
}

/**
 * Strips a leading "#12 " that a model copied out of a tool listing. The
 * listings no longer print ids, but a title carrying one would otherwise fork
 * the story it was meant to reuse — and compound on the next run.
 */
function cleanTitle(title: string): string {
  return (title ?? "").replace(/^(?:#\d+\s+)+/, "").trim();
}

/**
 * Models drift outside the 1-10 scale and occasionally answer "8/10" or "high".
 * Anything that isn't a usable number stays null rather than being guessed at.
 */
function clampImportance(value: unknown): number | null {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.min(10, Math.max(1, n));
}
