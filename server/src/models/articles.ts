import { query, withTransaction } from "../db/pool";
import { ArticleImage } from "../components/articles/images";
import { Article, FeedArticle } from "../api/types";

/**
 * Articles belong to the source they came from, not to a dashboard: one
 * headline is stored once however many dashboards read that source. Where it
 * is filed — which story, how important, or that it is not news here at all —
 * is one dashboard's opinion and lives in `article_filings`, which is why
 * nearly every read below joins through `dashboard_sources`.
 */

/** The dashboard's sources, as a subquery every feed read is narrowed by. */
const OF_DASHBOARD = `a.source_id in (
  select ds.source_id from dashboard_sources ds where ds.dashboard_id = $1
)`;

/** Nothing has filed it here, or a filing exists that decided nothing. */
const UNCATEGORIZED = `not exists (
  select 1 from article_filings f
   where f.dashboard_id = $1
     and f.article_id = a.id
     and (f.story_id is not null or f.skipped_at is not null)
)`;

type FeedRow = {
  id: string;
  title: string;
  url: string;
  image: string;
  uncategorized: boolean;
  source_id: string;
  created_at: Date;
  published_at: Date | null;
  importance: number | null;
  has_content: boolean;
};

function toFeedArticle(row: FeedRow, tags: string[] = []): FeedArticle {
  return {
    id: Number(row.id),
    hasContent: row.has_content,
    title: row.title,
    url: row.url,
    image: row.image,
    uncategorized: row.uncategorized,
    sourceId: row.source_id,
    createdAt: row.created_at.toISOString(),
    publishedAt: row.published_at?.toISOString() ?? null,
    importance: row.importance,
    tags,
  };
}

/**
 * Every article this dashboard can see, newest first, whichever of its sources
 * it came from. "Newest" is `sorted_at`: when the publisher says it went out,
 * or when we first saw it for the sources that never tell us. Articles sharing
 * a timestamp — a whole scraped page lands on one `created_at` — fall back to
 * `position`, the order the source listed them in.
 */
export async function feed(
  dashboardId: string,
  limit: number,
): Promise<FeedArticle[]> {
  const { rows } = await query<FeedRow>(
    `select a.id, a.title, a.url, a.image, a.source_id, a.created_at,
            a.published_at, a.content is not null as has_content,
            f.importance,
            ${UNCATEGORIZED} as uncategorized
       from articles a
       left join article_filings f
         on f.article_id = a.id and f.dashboard_id = $1
      where ${OF_DASHBOARD}
      order by a.sorted_at desc, a.position, a.id
      limit $2`,
    [dashboardId, limit],
  );

  // the narrow latest column does not render tags; the story feed fills them
  return rows.map((r) => toFeedArticle(r));
}

export type ArticleRow = {
  id: number;
  sourceId: string;
  title: string;
  url: string;
};

/**
 * One article, for a job that was handed nothing but its id. Not scoped to a
 * dashboard — an article is the source's, and every dashboard reading that
 * source sees the same row.
 */
export async function byId(id: number): Promise<ArticleRow | null> {
  const { rows } = await query<{
    id: string;
    source_id: string;
    title: string;
    url: string;
  }>("select id, source_id, title, url from articles where id = $1", [id]);
  const row = rows[0];
  if (!row) return null;

  return {
    id: Number(row.id),
    sourceId: row.source_id,
    title: row.title,
    url: row.url,
  };
}

/** Whether this dashboard reads the source the article came from. */
export async function isVisibleTo(
  dashboardId: string,
  articleId: number,
): Promise<boolean> {
  const { rowCount } = await query(
    `select 1 from articles a where a.id = $2 and ${OF_DASHBOARD}`,
    [dashboardId, articleId],
  );
  return rowCount === 1;
}

/**
 * The article's own text, for the modal that shows it. Kept out of every other
 * query — it is the one column big enough that selecting it by accident would
 * cost something.
 */
export async function contentOf(id: number): Promise<{
  content: string;
  contentAt: string;
  images: ArticleImage[];
} | null> {
  const { rows } = await query<{
    content: string | null;
    content_at: Date | null;
    content_images: ArticleImage[] | null;
  }>(
    "select content, content_at, content_images from articles where id = $1",
    [id],
  );
  const row = rows[0];
  if (!row?.content || !row.content_at) return null;

  return {
    content: row.content,
    contentAt: row.content_at.toISOString(),
    images: row.content_images ?? [],
  };
}

/**
 * Stores extracted text and the urls of its pictures, stamping when it was
 * read. Re-reading overwrites — the page may have been corrected since.
 */
export async function saveContent(
  id: number,
  content: string,
  images: ArticleImage[],
): Promise<boolean> {
  const { rowCount } = await query(
    `update articles
        set content = $2, content_images = $3::jsonb, content_at = now()
      where id = $1`,
    [id, content, JSON.stringify(images)],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Takes articles the agent judged not to be news for this dashboard out of its
 * work queue, with the reason it gave, so a later look can tell a deliberate
 * rejection from an article nothing has touched yet.
 *
 * Per dashboard, like every filing: an article another arc is running with is
 * still an irrelevance here. Returns how many rows it actually stamped.
 */
export async function markSkipped(
  dashboardId: string,
  rejected: { id: number; reason: string }[],
): Promise<number> {
  if (rejected.length === 0) return 0;

  const { rowCount } = await query(
    `insert into article_filings
         (dashboard_id, article_id, skipped_at, skipped_reason)
       select $1, r.id, now(), r.reason
         from unnest($2::bigint[], $3::text[]) as r(id, reason)
     on conflict (dashboard_id, article_id) do update
        set skipped_at = excluded.skipped_at,
            skipped_reason = excluded.skipped_reason
      where article_filings.story_id is null`,
    [
      dashboardId,
      rejected.map((r) => r.id),
      rejected.map((r) => r.reason.slice(0, 200)),
    ],
  );
  return rowCount ?? 0;
}

/**
 * The tags on each of these articles, alphabetically. `article_tags` is a
 * plain (article_id, tag_id) pair with no ordinal, so the order the agent
 * wrote them in — broadest first — isn't recoverable; alphabetical at least
 * keeps the chips stable between renders.
 *
 * Scoped to the dashboard through the tag: the same article carries one
 * vocabulary here and another one in the arc next door.
 */
export async function tagsFor(
  dashboardId: string,
  ids: number[],
): Promise<Map<number, string[]>> {
  const byArticle = new Map<number, string[]>();
  if (ids.length === 0) return byArticle;

  const { rows } = await query<{ article_id: string; name: string }>(
    `select at.article_id, t.name
       from article_tags at
       join tags t on t.id = at.tag_id
      where t.dashboard_id = $1 and at.article_id = any($2::bigint[])
      order by at.article_id, t.name`,
    [dashboardId, ids],
  );

  for (const row of rows) {
    const id = Number(row.article_id);
    const list = byArticle.get(id);
    if (list) list.push(row.name);
    else byArticle.set(id, [row.name]);
  }
  return byArticle;
}

/** How many articles are waiting for this dashboard's categorizing agent. */
export async function uncategorizedCount(
  dashboardId: string,
  days: number,
): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `select count(*) from articles a
      where ${OF_DASHBOARD}
        and ${UNCATEGORIZED}
        and a.created_at >= now() - make_interval(days => $2::int)`,
    [dashboardId, days],
  );
  return Number(rows[0]?.count ?? 0);
}

export type UncategorizedArticle = {
  id: number;
  title: string;
  url: string;
  sourceId: string;
  createdAt: string;
  /** When the source published it, falling back to when we first saw it. */
  publishedAt: string;
  /** The outlet's own summary, where the source is one that supplies it. */
  description: string | null;
};

/**
 * Articles from this dashboard's sources that it has not filed yet, newest
 * first. This is the agent's work queue: once a run persists, these articles
 * carry a filing row — a story, or a skip if the agent judged them not to be
 * news here — and drop out, so the next run never re-does them.
 *
 * The window is what defines the batch — `days` back from now, everything in
 * it. `limit` is only a safety valve for a runaway backlog; leave it undefined
 * to take the whole window.
 */
export async function uncategorized(
  dashboardId: string,
  { days, limit }: { days: number; limit?: number | undefined },
): Promise<UncategorizedArticle[]> {
  const { rows } = await query<{
    id: string;
    title: string;
    url: string;
    source_id: string;
    created_at: Date;
    published_at: Date;
    description: string | null;
  }>(
    `select a.id, a.title, a.url, a.source_id, a.created_at, a.description,
            coalesce(a.published_at, a.created_at) as published_at
       from articles a
      where ${OF_DASHBOARD}
        and ${UNCATEGORIZED}
        and a.created_at >= now() - make_interval(days => $2::int)
      order by a.created_at desc, a.position, a.id
      limit $3`,
    [dashboardId, days, limit ?? null],
  );

  return rows.map((r) => ({
    id: Number(r.id),
    title: r.title,
    url: r.url,
    sourceId: r.source_id,
    createdAt: r.created_at.toISOString(),
    publishedAt: r.published_at.toISOString(),
    description: r.description,
  }));
}

/**
 * Put `items` at the top of a source's list, demoting whatever was already
 * there. Items whose url is already stored are skipped. Runs under a row lock
 * so concurrent refreshes can't interleave. Returns how many rows it inserted.
 */
export function prepend(sourceId: string, items: Article[]): Promise<number> {
  return withTransaction(async (client) => {
    await client.query("select 1 from sources where id = $1 for update", [
      sourceId,
    ]);

    await client.query(
      "update articles set position = position + $2 where source_id = $1",
      [sourceId, items.length],
    );

    if (items.length === 0) return 0;

    const { rowCount } = await client.query(
      `insert into articles
           (source_id, position, title, url, image, published_at, description)
         select $1, t.i - 1, t.title, t.url, t.image,
                t.published_at, nullif(t.description, '')
         from unnest($2::text[], $3::text[], $4::text[], $5::timestamptz[],
                     $6::text[])
           with ordinality as t(title, url, image, published_at, description, i)
       on conflict (source_id, url) do nothing`,
      [
        sourceId,
        items.map((a) => a.title),
        items.map((a) => a.url),
        items.map((a) => a.image),
        items.map((a) => a.publishedAt ?? null),
        items.map((a) => a.description ?? ""),
      ],
    );
    return rowCount ?? 0;
  });
}
