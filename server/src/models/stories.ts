import { query, withTransaction } from "../db/pool";
import * as articles from "./articles";
import { StoryFeedEntry } from "../api/types";
import { slugify } from "../utils/slug";

/**
 * A story is one event as one dashboard sees it, and every article under it is
 * there because that dashboard filed it there — see `article_filings`. Two
 * dashboards reading the same source keep entirely separate stories over the
 * same articles.
 */

type StoryRow = {
  id: string;
  title: string;
  slug: string;
  updated_at: Date;
};

type StoryArticleRow = {
  id: string;
  story_id: string;
  title: string;
  url: string;
  image: string;
  source_id: string;
  created_at: Date;
  published_at: Date | null;
  importance: number | null;
  has_content: boolean;
};

const FEED_SELECT = `select s.id, s.title, s.slug,
                            max(a.sorted_at) as updated_at
                       from stories s
                       join article_filings f on f.story_id = s.id
                       join articles a on a.id = f.article_id`;

/**
 * The dashboard's stories, each with its articles. Ordered by the story's
 * newest article, so a fresh headline pulls its story to the top. Newest by
 * `sorted_at` — the publisher's date where there is one, ours otherwise — so a
 * feed handing us its back catalogue does not shove week-old events up.
 *
 * Stories nobody has filed an article under are left out — there is nothing to
 * render for them.
 */
export async function feed(
  dashboardId: string,
  limit: number,
): Promise<StoryFeedEntry[]> {
  const { rows } = await query<StoryRow>(
    `${FEED_SELECT}
      where s.dashboard_id = $1 and f.dashboard_id = $1
      group by s.id
      order by max(a.sorted_at) desc, s.id desc
      limit $2`,
    [dashboardId, limit],
  );
  return withArticles(dashboardId, rows);
}

/** Hangs each story's articles, with their tags, off the rows just selected. */
async function withArticles(
  dashboardId: string,
  rows: StoryRow[],
): Promise<StoryFeedEntry[]> {
  if (rows.length === 0) return [];

  const entries = rows.map<StoryFeedEntry>((r) => ({
    id: Number(r.id),
    title: r.title,
    slug: r.slug,
    updatedAt: r.updated_at.toISOString(),
    articles: [],
  }));

  const byId = new Map(entries.map((e) => [e.id, e]));
  const { rows: articleRows } = await query<StoryArticleRow>(
    `select a.id, f.story_id, a.title, a.url, a.image, a.source_id,
            a.created_at, a.published_at, f.importance,
            a.content is not null as has_content
       from article_filings f
       join articles a on a.id = f.article_id
      where f.dashboard_id = $1 and f.story_id = any($2::bigint[])
      order by a.sorted_at desc, a.position, a.id`,
    [dashboardId, [...byId.keys()]],
  );

  const tags = await articles.tagsFor(
    dashboardId,
    articleRows.map((r) => Number(r.id)),
  );

  for (const row of articleRows) {
    byId.get(Number(row.story_id))?.articles.push({
      id: Number(row.id),
      hasContent: row.has_content,
      title: row.title,
      url: row.url,
      image: row.image,
      // an article under a story is by definition categorized
      uncategorized: false,
      sourceId: row.source_id,
      createdAt: row.created_at.toISOString(),
      publishedAt: row.published_at?.toISOString() ?? null,
      importance: row.importance,
      tags: tags.get(Number(row.id)) ?? [],
    });
  }

  return entries;
}

/**
 * One story with its articles, found the way an agent refers to it: by title.
 * Exact match first, then a substring, so the title an agent read out of
 * GET_STORIES resolves even when it retypes it loosely.
 */
export async function detail(
  dashboardId: string,
  title: string,
  articleLimit: number,
): Promise<{ story: StoryFeedEntry; totalArticles: number } | null> {
  const { rows } = await query<StoryRow>(
    `${FEED_SELECT}
      where s.dashboard_id = $1 and f.dashboard_id = $1
        and (lower(s.title) = lower($2) or s.title ilike '%' || $2 || '%')
      group by s.id
      order by (lower(s.title) = lower($2)) desc, max(a.sorted_at) desc
      limit 1`,
    [dashboardId, title],
  );
  const found = await withArticles(dashboardId, rows);
  const story = found[0];
  if (!story) return null;

  // Trimmed here rather than in the query: `withArticles` loads a story's
  // articles in one pass for the feed, and they come back newest first, so the
  // ones kept are the recent ones. The total goes with them — an agent that
  // only sees 50 should know whether that was all of them.
  const totalArticles = story.articles.length;
  return {
    story: { ...story, articles: story.articles.slice(0, articleLimit) },
    totalArticles,
  };
}

/** Renames a story in place; the slug follows, so later runs match the new one. */
export async function rename(
  dashboardId: string,
  storyId: number,
  title: string,
): Promise<boolean> {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("a story needs a title");

  const { rowCount } = await query(
    `update stories set title = $3, slug = $4
      where dashboard_id = $1 and id = $2`,
    [dashboardId, storyId, trimmed, slugify(trimmed)],
  );
  return (rowCount ?? 0) > 0;
}

/** Unfiles a story and everything under it; the articles return to the queue. */
export async function remove(
  dashboardId: string,
  storyId: number,
): Promise<boolean> {
  const { rowCount } = await query(
    "delete from stories where dashboard_id = $1 and id = $2",
    [dashboardId, storyId],
  );
  return (rowCount ?? 0) > 0;
}

export type MergeResult = {
  /** The story that survived, with everything now under it. */
  storyId: number;
  title: string;
  /** How many articles moved across. */
  moved: number;
  /** How many the surviving story holds now. */
  articles: number;
  /** The story that was folded in and no longer exists. */
  merged: { id: number; title: string };
};

/**
 * Folds one story into another: every article filed under `sourceId` moves to
 * `targetId`, then the source is deleted. Nothing new is created, and the
 * target keeps its own title — a merge says these articles were always part of
 * that story, not that a third story should exist.
 *
 * All of it in one transaction — half a merge would leave filings pointing at
 * nothing, which is the one outcome worse than not merging.
 *
 * Never called by an agent directly. It runs from an approved proposal, with
 * the ids the reader was shown.
 */
export async function merge(
  dashboardId: string,
  sourceId: number,
  targetId: number,
): Promise<MergeResult> {
  if (sourceId === targetId) {
    throw new Error("a story cannot be merged into itself");
  }

  return withTransaction(async (client) => {
    // Locked before anything is read, lowest id first: the categorizing agent
    // files articles into these same rows, and two merges taking their locks
    // in opposite orders would deadlock.
    const { rows: found } = await client.query<{ id: string; title: string }>(
      `select id, title from stories
        where dashboard_id = $1 and id = any($2::bigint[])
        order by id
        for update`,
      [dashboardId, [sourceId, targetId]],
    );

    const byId = new Map(found.map((r) => [Number(r.id), r.title]));
    const missing = [sourceId, targetId].filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new Error(`no story ${missing.join(", ")} in this dashboard`);
    }

    const { rowCount: moved } = await client.query(
      `update article_filings set story_id = $1
        where dashboard_id = $2 and story_id = $3`,
      [targetId, dashboardId, sourceId],
    );

    await client.query(
      "delete from stories where dashboard_id = $1 and id = $2",
      [dashboardId, sourceId],
    );

    const { rows: counted } = await client.query<{ articles: string }>(
      `select count(*) as articles from article_filings
        where dashboard_id = $1 and story_id = $2`,
      [dashboardId, targetId],
    );

    return {
      storyId: targetId,
      title: byId.get(targetId)!,
      moved: moved ?? 0,
      articles: Number(counted[0]!.articles),
      merged: { id: sourceId, title: byId.get(sourceId)! },
    };
  });
}

export type StoryMatch = {
  title: string;
  articleCount: number;
};

/**
 * The stories filed here, newest first, optionally narrowed to those whose
 * title contains `term`.
 *
 * Listing and grepping are one read because they were always one query with an
 * `ilike` on or off. What the caller wants either way is the same thing: the
 * titles already in use, so a run attaches to an event another run filed
 * rather than forking it — reusing a title exactly matches its slug on save,
 * and the article joins that story.
 *
 * The unfiltered call is the one that matters most, and is the reason grepping
 * alone was never enough: a search only finds an event whose wording you can
 * already guess, while the whole list shows the run a story it would have
 * named differently.
 */
export async function list(
  dashboardId: string,
  { term = "", limit }: { term?: string; limit: number },
): Promise<StoryMatch[]> {
  const filtered = term.trim().length > 0;
  const { rows } = await query<{ title: string; articles: string }>(
    `select s.title, count(f.article_id) as articles
       from stories s
       left join article_filings f
         on f.story_id = s.id and f.dashboard_id = $1
       left join articles a on a.id = f.article_id
      where s.dashboard_id = $1
        ${filtered ? "and s.title ilike '%' || $3 || '%'" : ""}
      group by s.id
      order by max(a.sorted_at) desc nulls last, s.id desc
      limit $2`,
    filtered ? [dashboardId, limit, term] : [dashboardId, limit],
  );

  return rows.map((r) => ({
    title: r.title,
    articleCount: Number(r.articles),
  }));
}

/** One story to save, with the articles that belong to it and their tags. */
export type StoryEntry = {
  story: string;
  articles: { id: number; importance: number | null; tags: string[] }[];
};

export type SaveResult = {
  stories: number;
  /** Stories matched by slug instead of created — the point of the exercise. */
  reusedStories: number;
  articles: number;
  tags: number;
  reusedTags: number;
};

/**
 * Writes a categorization run into stories, filings and tags in one
 * transaction, reusing whatever is already there: stories and tags are matched
 * by slug within the dashboard, so a second run over the same event extends it
 * instead of forking it.
 *
 * Nothing is ever deleted here — an article is only filed — so a re-run cannot
 * lose earlier work.
 */
export async function save(
  dashboardId: string,
  entries: StoryEntry[],
): Promise<SaveResult> {
  return withTransaction(async (client) => {
    const result: SaveResult = {
      stories: 0,
      reusedStories: 0,
      articles: 0,
      tags: 0,
      reusedTags: 0,
    };

    // slug -> id, so a repeated name inside one run costs a single lookup
    const tagIds = new Map<string, number>();

    for (const entry of entries) {
      const storySlug = slugify(entry.story);
      if (!storySlug || entry.articles.length === 0) continue;

      // a story already carrying this slug is the same event seen again: keep
      // the row and hang the new articles off it
      const existing = await client.query<{ id: string }>(
        "select id from stories where dashboard_id = $1 and slug = $2",
        [dashboardId, storySlug],
      );
      let storyId: number;
      if (existing.rows[0]) {
        storyId = Number(existing.rows[0].id);
        result.reusedStories++;
      } else {
        const created = await client.query<{ id: string }>(
          `insert into stories (dashboard_id, title, slug)
           values ($1, $2, $3) returning id`,
          [dashboardId, entry.story, storySlug],
        );
        storyId = Number(created.rows[0]!.id);
        result.stories++;
      }

      for (const article of entry.articles) {
        // A re-run may leave importance out; coalesce keeps the earlier score.
        // The filing is only written for articles this dashboard can actually
        // see, so a model that invents an id cannot file it here.
        const filed = await client.query(
          `insert into article_filings
               (dashboard_id, article_id, story_id, importance)
             select $1, a.id, $3, $4
               from articles a
              where a.id = $2
                and a.source_id in (
                  select ds.source_id from dashboard_sources ds
                   where ds.dashboard_id = $1
                )
           on conflict (dashboard_id, article_id) do update
              set story_id = excluded.story_id,
                  importance = coalesce(excluded.importance,
                                        article_filings.importance),
                  skipped_at = null,
                  skipped_reason = null`,
          [dashboardId, article.id, storyId, article.importance],
        );
        result.articles += filed.rowCount ?? 0;

        for (const name of article.tags) {
          const tagSlug = slugify(name);
          if (!tagSlug) continue;

          let tagId = tagIds.get(tagSlug);
          if (tagId === undefined) {
            const found = await client.query<{ id: string }>(
              "select id from tags where dashboard_id = $1 and slug = $2",
              [dashboardId, tagSlug],
            );
            if (found.rows[0]) {
              tagId = Number(found.rows[0].id);
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
