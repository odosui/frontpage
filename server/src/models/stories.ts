import { withTransaction } from "../db/pool";
import { slugify } from "../utils/slug";

/** One story to save, with the articles that belong to it and their tags. */
export type StoryEntry = {
  storyline: string;
  story: string;
  articles: { id: number; tags: string[] }[];
};

export type SaveResult = {
  storylines: number;
  stories: number;
  articles: number;
  tags: number;
  /** Rows matched by slug instead of created — the point of the whole exercise. */
  reusedStorylines: number;
  reusedTags: number;
};

/**
 * Writes a categorization run into storylines / stories / tags in one
 * transaction, reusing whatever is already there: storylines and tags are
 * matched by slug within the dashboard, so a second run over the same arc
 * extends it instead of forking it.
 *
 * Nothing is ever deleted here — articles are only moved into a story — so a
 * re-run cannot lose earlier work.
 */
export async function save(
  dashboardId: string,
  entries: StoryEntry[],
): Promise<SaveResult> {
  return withTransaction(async (client) => {
    const result: SaveResult = {
      storylines: 0,
      stories: 0,
      articles: 0,
      tags: 0,
      reusedStorylines: 0,
      reusedTags: 0,
    };

    // slug -> id, so repeated names inside one run cost a single lookup
    const storylineIds = new Map<string, number>();
    const tagIds = new Map<string, number>();

    for (const entry of entries) {
      const storylineSlug = slugify(entry.storyline);
      const storySlug = slugify(entry.story);
      if (!storylineSlug || !storySlug || entry.articles.length === 0) continue;

      let storylineId = storylineIds.get(storylineSlug);
      if (storylineId === undefined) {
        const existing = await client.query<{ id: string }>(
          "select id from storylines where dashboard_id = $1 and slug = $2",
          [dashboardId, storylineSlug],
        );
        if (existing.rows[0]) {
          storylineId = Number(existing.rows[0].id);
          result.reusedStorylines++;
        } else {
          const created = await client.query<{ id: string }>(
            `insert into storylines (dashboard_id, title, slug)
             values ($1, $2, $3) returning id`,
            [dashboardId, entry.storyline, storylineSlug],
          );
          storylineId = Number(created.rows[0]!.id);
          result.storylines++;
        }
        storylineIds.set(storylineSlug, storylineId);
      }

      // a story already carrying this slug is the same event seen again: keep
      // the row and hang the new articles off it
      const story = await client.query<{ id: string }>(
        `insert into stories (dashboard_id, storyline_id, title, slug)
         values ($1, $2, $3, $4)
         on conflict (dashboard_id, slug)
           do update set storyline_id = excluded.storyline_id
         returning id`,
        [dashboardId, storylineId, entry.story, storySlug],
      );
      const storyId = Number(story.rows[0]!.id);
      result.stories++;

      for (const article of entry.articles) {
        const moved = await client.query(
          `update articles set story_id = $3
           where id = $1 and dashboard_id = $2`,
          [article.id, dashboardId, storyId],
        );
        result.articles += moved.rowCount ?? 0;

        for (const name of article.tags) {
          const tagSlug = slugify(name);
          if (!tagSlug) continue;

          let tagId = tagIds.get(tagSlug);
          if (tagId === undefined) {
            const existing = await client.query<{ id: string }>(
              "select id from tags where dashboard_id = $1 and slug = $2",
              [dashboardId, tagSlug],
            );
            if (existing.rows[0]) {
              tagId = Number(existing.rows[0].id);
              result.reusedTags++;
            } else {
              const created = await client.query<{ id: string }>(
                `insert into tags (dashboard_id, name, slug)
                 values ($1, $2, $3) returning id`,
                [dashboardId, name, tagSlug],
              );
              tagId = Number(created.rows[0]!.id);
              result.tags++;
            }
            tagIds.set(tagSlug, tagId);
          }

          await client.query(
            `insert into article_tags (article_id, tag_id)
             values ($1, $2) on conflict do nothing`,
            [article.id, tagId],
          );
        }
      }
    }

    return result;
  });
}
