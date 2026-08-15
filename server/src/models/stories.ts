import { query, withTransaction } from "../db/pool";
import * as articles from "./articles";
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
  id: string;
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
    `select id, story_id, title, url, image, is_new as new, channel_id,
            created_at, importance
     from articles
     where story_id = any($1::bigint[])
     order by created_at desc, position, id`,
    [[...byId.keys()]],
  );

  const tags = await articles.tagsFor(articleRows.map((r) => Number(r.id)));

  for (const row of articleRows) {
    byId.get(Number(row.story_id))?.articles.push({
      title: row.title,
      url: row.url,
      image: row.image,
      new: row.new,
      channelId: row.channel_id,
      createdAt: row.created_at.toISOString(),
      importance: row.importance,
      tags: tags.get(Number(row.id)) ?? [],
    });
  }

  return entries;
}

export type StoryMatch = {
  title: string;
  storyline: string | null;
  articleCount: number;
};

/**
 * Stories whose title contains the given text, newest first. This is what lets
 * one run attach to an event another run already filed: reusing a story's exact
 * title matches its slug on save, so the article joins that story instead of
 * starting a near-identical one.
 */
export async function search(
  dashboardId: string,
  term: string,
  limit: number,
): Promise<StoryMatch[]> {
  const { rows } = await query<{
    title: string;
    storyline: string | null;
    articles: string;
  }>(
    `select s.title, sl.title as storyline, count(a.id) as articles
       from stories s
       left join storylines sl on sl.id = s.storyline_id
       left join articles a on a.story_id = s.id
      where s.dashboard_id = $1 and s.title ilike '%' || $2 || '%'
      group by s.id, sl.title
      order by max(a.created_at) desc nulls last, s.id desc
      limit $3`,
    [dashboardId, term, limit],
  );

  return rows.map((r) => ({
    title: r.title,
    storyline: r.storyline,
    articleCount: Number(r.articles),
  }));
}

/**
 * Every story filed under one storyline, newest first. Grepping by title only
 * finds an event when the run already guesses its wording; opening the arc it
 * belongs to shows the run what is actually in there, so a story that was named
 * differently the first time still gets found instead of forked.
 *
 * The storyline is resolved by slug first — runs are told to reuse exact titles
 * — and falls back to a substring match on the title, newest arc wins.
 */
export async function underStoryline(
  dashboardId: string,
  storyline: string,
  limit: number,
): Promise<{ storyline: string; stories: StoryMatch[] } | null> {
  const { rows: found } = await query<{ id: string; title: string }>(
    `select id, title from storylines
      where dashboard_id = $1 and (slug = $2 or title ilike '%' || $3 || '%')
      order by (slug = $2) desc, created_at desc, id desc
      limit 1`,
    [dashboardId, slugify(storyline), storyline],
  );
  const arc = found[0];
  if (!arc) return null;

  const { rows } = await query<{ title: string; articles: string }>(
    `select s.title, count(a.id) as articles
       from stories s
       left join articles a on a.story_id = s.id
      where s.dashboard_id = $1 and s.storyline_id = $2
      group by s.id
      order by max(a.created_at) desc nulls last, s.id desc
      limit $3`,
    [dashboardId, arc.id, limit],
  );

  return {
    storyline: arc.title,
    stories: rows.map((r) => ({
      title: r.title,
      storyline: arc.title,
      articleCount: Number(r.articles),
    })),
  };
}

/** One story to save, with the articles that belong to it and their tags. */
export type StoryEntry = {
  /** Null for a story that belongs to no running arc. */
  storyline: string | null;
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
      const storySlug = slugify(entry.story);
      if (!storySlug || entry.articles.length === 0) continue;

      // a standalone story hangs off no arc at all, rather than off one
      // literally called "standalone"
      const storylineSlug = entry.storyline ? slugify(entry.storyline) : "";
      let storylineId: number | null = storylineSlug
        ? (storylineIds.get(storylineSlug) ?? null)
        : null;

      if (storylineSlug && storylineId === null) {
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
