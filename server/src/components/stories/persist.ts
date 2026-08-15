import * as articles from "../../models/articles";
import * as stories from "../../models/stories";
import { StoryTree } from "./categorize";
import { PromptArticle } from "./prompt";

export type PersistResult = stories.SaveResult & {
  /** Prompt ids the model used that were not in the batch we sent it. */
  unknownIds: number[];
  /** Articles the model rejected as not being news; they leave the queue. */
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

  for (const storyline of tree.storylines ?? []) {
    for (const story of storyline.stories ?? []) {
      const articles: stories.StoryEntry["articles"] = [];

      for (const article of story.articles ?? []) {
        const articleId = articleIds.get(article.id);
        if (articleId === undefined) {
          unknownIds.push(article.id);
          continue;
        }
        articles.push({
          id: articleId,
          importance: clampImportance(article.importance),
          tags: article.tags ?? [],
        });
      }

      if (articles.length === 0) continue;
      entries.push({
        storyline: storyline.storyline,
        story: story.story,
        articles,
      });
    }
  }

  // an article the model refused to file has to be marked, or it sits in the
  // queue for ever: story_id stays null, so every later run picks it up again
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
 * Models drift outside the 1-10 scale and occasionally answer "8/10" or "high".
 * Anything that isn't a usable number stays null rather than being guessed at.
 */
function clampImportance(value: unknown): number | null {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.min(10, Math.max(1, n));
}
