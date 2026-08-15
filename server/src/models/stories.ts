import { query, withTransaction } from "../db/pool";
import { StoryFeedEntry } from "../api/types";
import { slugify } from "../utils/slug";

type StoryRow = {
  id: string;
  title: string;
  slug: string;
  storyline_id: string | null;
  storyline_title: string | null;
  storyline_slug: string | null;
  updated_at: Date;
};

type StoryArticleRow = {
  story_id: string;
  title: string;
  url: string;
  image: string;
  new: boolean;
  channel_id: string;
  created_at: Date;
  importance: number | null;
};

/**
 * The dashboard's stories, each with its articles. Ordered by the story's
 * newest article rather than by storyline, so a fresh headline pulls its story
 * to the top even when an older story from the same arc sits above it.
 *
 * Stories nobody has filed an article under are left out — there is nothing to
 * render for them.
 */
export async function feed(
  dashboardId: string,
  limit: number,
): Promise<StoryFeedEntry[]> {
  const { rows } = await query<StoryRow>(
    `select s.id, s.title, s.slug,
            sl.id as storyline_id, sl.title as storyline_title,
            sl.slug as storyline_slug,
            max(a.created_at) as updated_at
     from stories s
     join articles a on a.story_id = s.id
     left join storylines sl on sl.id = s.storyline_id
     where s.dashboard_id = $1
     group by s.id, sl.id
     order by max(a.created_at) desc, s.id desc
     limit $2`,
    [dashboardId, limit],
  );
  if (rows.length === 0) return [];

  const entries = rows.map<StoryFeedEntry>((r) => ({
    id: Number(r.id),
    title: r.title,
    slug: r.slug,
    storyline: r.storyline_id
      ? {
          id: Number(r.storyline_id),
          title: r.storyline_title ?? "",
          slug: r.storyline_slug ?? "",
        }
      : null,
    updatedAt: r.updated_at.toISOString(),
    articles: [],
  }));

  const byId = new Map(entries.map((e) => [e.id, e]));
  const { rows: articleRows } = await query<StoryArticleRow>(
    `select story_id, title, url, image, is_new as new, channel_id,
            created_at, importance
     from articles
     where story_id = any($1::bigint[])
     order by created_at desc, position, id`,
    [[...byId.keys()]],
  );

  for (const row of articleRows) {
    byId.get(Number(row.story_id))?.articles.push({
      title: row.title,
      url: row.url,
      image: row.image,
      new: row.new,
      channelId: row.channel_id,
      createdAt: row.created_at.toISOString(),
      importance: row.importance,
    });
  }

  return entries;
}

/** One story to save, with the articles that belong to it and their tags. */
export type StoryEntry = {
  storyline: string;
  story: string;
  articles: { id: number; importance: number | null; tags: string[] }[];
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
        // a re-run may leave importance out; coalesce keeps the earlier score
        const moved = await client.query(
          `update articles
             set story_id = $3,
                 importance = coalesce($4, importance)
           where id = $1 and dashboard_id = $2`,
          [article.id, dashboardId, storyId, article.importance],
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
