import * as stories from "../../models/stories";
import { StoryTree } from "./categorize";
import { PromptArticle } from "./prompt";

export type PersistResult = stories.SaveResult & {
  /** Prompt ids the model used that were not in the batch we sent it. */
  unknownIds: number[];
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
        articles.push({ id: articleId, tags: article.tags ?? [] });
      }

      if (articles.length === 0) continue;
      entries.push({
        storyline: storyline.storyline,
        story: story.story,
        articles,
      });
    }
  }

  const saved = await stories.save(dashboardId, entries);
  return { ...saved, unknownIds };
}
