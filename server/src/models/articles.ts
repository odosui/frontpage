import { query, withTransaction } from "../db/pool";
import { ArticleImage } from "../components/articles/images";
import { Article, FeedArticle } from "../api/types";

/**
 * Every article on the dashboard, newest first, whichever channel it came from.
 * "Newest" is `sorted_at`: when the publisher says it went out, or when we
 * first saw it for the channels that never tell us. Articles sharing a
 * timestamp — a whole scraped page lands on one `created_at` — fall back to
 * `position`, the order the source listed them in.
 */
export async function feed(
  dashboardId: string,
  limit: number,
): Promise<FeedArticle[]> {
  const { rows } = await query<{
    id: string;
    title: string;
    url: string;
    image: string;
    uncategorized: boolean;
    channel_id: string;
    created_at: Date;
    published_at: Date | null;
    importance: number | null;
    has_content: boolean;
  }>(
    `select id, title, url, image, channel_id, created_at,
            published_at, importance, content is not null as has_content,
            story_id is null and skipped_at is null as uncategorized
     from articles
     where dashboard_id = $1
     order by sorted_at desc, position, id
     limit $2`,
    [dashboardId, limit],
  );

  return rows.map((r) => ({
    id: Number(r.id),
    hasContent: r.has_content,
    title: r.title,
    url: r.url,
    image: r.image,
    uncategorized: r.uncategorized,
    channelId: r.channel_id,
    createdAt: new Date(r.created_at).toISOString(),
    publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
    importance: r.importance,
    // the narrow latest column does not render tags; the story feed fills them
    tags: [],
  }));
}

export type ArticleRow = {
  id: number;
  channelId: string;
  title: string;
  url: string;
};

/** One article, for a job that was handed nothing but its id. */
export async function byId(
  dashboardId: string,
  id: number,
): Promise<ArticleRow | null> {
  const { rows } = await query<{
    id: string;
    channel_id: string;
    title: string;
    url: string;
  }>(
    `select id, channel_id, title, url from articles
      where dashboard_id = $1 and id = $2`,
    [dashboardId, id],
  );
  const row = rows[0];
  if (!row) return null;

  return {
    id: Number(row.id),
    channelId: row.channel_id,
    title: row.title,
    url: row.url,
  };
}

/**
 * The article's own text, for the modal that shows it. Kept out of every other
 * query — it is the one column big enough that selecting it by accident would
 * cost something.
 */
export async function contentOf(
  dashboardId: string,
  id: number,
): Promise<{
  content: string;
  contentAt: string;
  images: ArticleImage[];
} | null> {
  const { rows } = await query<{
    content: string | null;
    content_at: Date | null;
    content_images: ArticleImage[] | null;
  }>(
    `select content, content_at, content_images from articles
      where dashboard_id = $1 and id = $2`,
    [dashboardId, id],
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
  dashboardId: string,
  id: number,
  content: string,
  images: ArticleImage[],
): Promise<boolean> {
  const { rowCount } = await query(
    `update articles
        set content = $3, content_images = $4::jsonb, content_at = now()
      where dashboard_id = $1 and id = $2`,
    [dashboardId, id, content, JSON.stringify(images)],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Takes articles the agent judged not to be news out of the work queue, with
 * the reason it gave, so a later look can tell a deliberate rejection from an
 * article nothing has touched yet. Returns how many rows it actually stamped.
 */
export async function markSkipped(
  dashboardId: string,
  rejected: { id: number; reason: string }[],
): Promise<number> {
  if (rejected.length === 0) return 0;

  const { rowCount } = await query(
    `update articles a
        set skipped_at = now(), skipped_reason = r.reason
       from unnest($2::bigint[], $3::text[]) as r(id, reason)
      where a.id = r.id
        and a.dashboard_id = $1
        and a.story_id is null`,
    [
      dashboardId,
      rejected.map((r) => r.id),
      rejected.map((r) => r.reason.slice(0, 200)),
    ],
  );
  return rowCount ?? 0;
}

/**
 * The tags on each of these articles, alphabetically. article_tags is a plain
 * (article_id, tag_id) pair with no ordinal, so the order the agent wrote them
 * in — broadest first — isn't recoverable; alphabetical at least keeps the
 * chips stable between renders.
 */
export async function tagsFor(ids: number[]): Promise<Map<number, string[]>> {
  const byArticle = new Map<number, string[]>();
  if (ids.length === 0) return byArticle;

  const { rows } = await query<{ article_id: string; name: string }>(
    `select at.article_id, t.name
       from article_tags at
       join tags t on t.id = at.tag_id
      where at.article_id = any($1::bigint[])
      order by at.article_id, t.name`,
    [ids],
  );

  for (const row of rows) {
    const id = Number(row.article_id);
    const list = byArticle.get(id);
    if (list) list.push(row.name);
    else byArticle.set(id, [row.name]);
  }
  return byArticle;
}

/** How many articles are waiting for the categorizing agent right now. */
export async function uncategorizedCount(
  dashboardId: string,
  days: number,
): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `select count(*) from articles
      where dashboard_id = $1
        and story_id is null
        and skipped_at is null
        and created_at >= now() - make_interval(days => $2::int)`,
    [dashboardId, days],
  );
  return Number(rows[0]?.count ?? 0);
}

export type UncategorizedArticle = {
  id: number;
  title: string;
  url: string;
  channelId: string;
  createdAt: string;
  /** When the source published it, falling back to when we first saw it. */
  publishedAt: string;
  /** The feed's own summary, where the channel is one that supplies it. */
  description: string | null;
};

/**
 * Articles in this dashboard that no story has claimed yet, newest first.
 * This is the agent's work queue: once a run persists, these rows carry a
 * story_id — or a skipped_at, if the agent judged them not to be news — and
 * drop out, so the next run never re-does them.
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
    channel_id: string;
    created_at: Date;
    published_at: Date;
    description: string | null;
  }>(
    `select id, title, url, channel_id, created_at, description,
            coalesce(published_at, created_at) as published_at
     from articles
     where dashboard_id = $1
       and story_id is null
       and skipped_at is null
       and created_at >= now() - make_interval(days => $2::int)
     order by created_at desc, position, id
     limit $3`,
    [dashboardId, days, limit ?? null],
  );

  return rows.map((r) => ({
    id: Number(r.id),
    title: r.title,
    url: r.url,
    channelId: r.channel_id,
    createdAt: r.created_at.toISOString(),
    publishedAt: r.published_at.toISOString(),
    description: r.description,
  }));
}

/**
 * Put `items` at the top of a channel's list, demoting whatever was already
 * there. Items whose url is already stored are skipped. Runs under a row lock
 * so concurrent refreshes can't interleave. Returns how many rows it inserted.
 */
export function prepend(
  dashboardId: string,
  channelId: string,
  items: Article[],
): Promise<number> {
  return withTransaction(async (client) => {
    await client.query(
      "select 1 from channels where dashboard_id = $1 and id = $2 for update",
      [dashboardId, channelId],
    );

    await client.query(
      `update articles set position = position + $3
       where dashboard_id = $1 and channel_id = $2`,
      [dashboardId, channelId, items.length],
    );

    if (items.length === 0) return 0;

    const { rowCount } = await client.query(
      `insert into articles
           (dashboard_id, channel_id, position, title, url, image,
            published_at, description)
         select $1, $2, t.i - 1, t.title, t.url, t.image,
                t.published_at, nullif(t.description, '')
         from unnest($3::text[], $4::text[], $5::text[], $6::timestamptz[],
                     $7::text[])
           with ordinality as t(title, url, image, published_at, description, i)
         where not exists (
           select 1 from articles existing
           where existing.dashboard_id = $1
             and existing.channel_id = $2
             and existing.url = t.url
         )`,
      [
        dashboardId,
        channelId,
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

/** Swap a channel's article list wholesale, preserving the given order. */
export function replace(
  dashboardId: string,
  channelId: string,
  items: Article[],
) {
  return withTransaction(async (client) => {
    await client.query(
      "delete from articles where dashboard_id = $1 and channel_id = $2",
      [dashboardId, channelId],
    );

    if (items.length === 0) return;

    await client.query(
      `insert into articles
         (dashboard_id, channel_id, position, title, url, image)
       select $1, $2, t.i - 1, t.title, t.url, t.image
       from unnest($3::text[], $4::text[], $5::text[])
         with ordinality as t(title, url, image, i)`,
      [
        dashboardId,
        channelId,
        items.map((a) => a.title),
        items.map((a) => a.url),
        items.map((a) => a.image),
      ],
    );
  });
}
