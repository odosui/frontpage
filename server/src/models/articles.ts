import { query, withTransaction } from "../db/pool";
import { Article, FeedArticle } from "../api/types";

/**
 * Every article on the dashboard, newest first, whichever channel it came from.
 * Articles stored in the same refresh share a `created_at`, so `position` — the
 * order the source listed them in — breaks the tie.
 */
export async function feed(
  dashboardId: string,
  limit: number,
): Promise<FeedArticle[]> {
  const { rows } = await query<{
    title: string;
    url: string;
    image: string;
    new: boolean;
    channel_id: string;
    created_at: Date;
    published_at: Date | null;
    importance: number | null;
  }>(
    `select title, url, image, is_new as new, channel_id, created_at,
            published_at, importance
     from articles
     where dashboard_id = $1
     order by created_at desc, position, id
     limit $2`,
    [dashboardId, limit],
  );

  return rows.map((r) => ({
    title: r.title,
    url: r.url,
    image: r.image,
    new: r.new,
    channelId: r.channel_id,
    createdAt: new Date(r.created_at).toISOString(),
    publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
    importance: r.importance,
    // the narrow latest column does not render tags; the story feed fills them
    tags: [],
  }));
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
 * Clears the unread marks on a channel. `prepend` does this as part of storing
 * a fetch, but a fetch that finds the page unchanged never gets that far — the
 * articles are still the ones the reader has already seen, so they stop being
 * new either way. Returns how many rows it cleared.
 */
export async function markRead(
  dashboardId: string,
  channelId: string,
): Promise<number> {
  const { rowCount } = await query(
    `update articles set is_new = false
      where dashboard_id = $1 and channel_id = $2 and is_new`,
    [dashboardId, channelId],
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
 * Put `items` at the top of a channel's list, marked as new, demoting whatever
 * was already there. Items whose url is already stored are skipped. Runs under
 * a row lock so concurrent refreshes can't interleave. Returns the resulting
 * list, capped at `limit`.
 */
export function prepend(
  dashboardId: string,
  channelId: string,
  items: Article[],
  limit: number,
): Promise<Article[]> {
  return withTransaction(async (client) => {
    await client.query(
      "select 1 from channels where dashboard_id = $1 and id = $2 for update",
      [dashboardId, channelId],
    );

    await client.query(
      `update articles set is_new = false, position = position + $3
       where dashboard_id = $1 and channel_id = $2`,
      [dashboardId, channelId, items.length],
    );

    if (items.length > 0) {
      await client.query(
        `insert into articles
           (dashboard_id, channel_id, position, title, url, image, is_new,
            published_at, description)
         select $1, $2, t.i - 1, t.title, t.url, t.image, true,
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
    }

    const { rows } = await client.query<Article>(
      `select title, url, image, is_new as new
       from articles
       where dashboard_id = $1 and channel_id = $2
       order by position
       limit $3`,
      [dashboardId, channelId, limit],
    );
    return rows;
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
         (dashboard_id, channel_id, position, title, url, image, is_new)
       select $1, $2, t.i - 1, t.title, t.url, t.image, t.is_new
       from unnest($3::text[], $4::text[], $5::text[], $6::boolean[])
         with ordinality as t(title, url, image, is_new, i)`,
      [
        dashboardId,
        channelId,
        items.map((a) => a.title),
        items.map((a) => a.url),
        items.map((a) => a.image),
        items.map((a) => a.new ?? false),
      ],
    );
  });
}
