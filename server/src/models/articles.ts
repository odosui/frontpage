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
  }>(
    `select title, url, image, is_new as new, channel_id, created_at
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
  }));
}

export type UncategorizedArticle = {
  id: number;
  title: string;
  url: string;
  channelId: string;
  createdAt: string;
};

/**
 * Articles in this dashboard that no story has claimed yet, newest first.
 * This is the agent's work queue: once a run persists, these rows carry a
 * story_id and drop out, so the next run never re-does them.
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
  }>(
    `select id, title, url, channel_id, created_at
     from articles
     where dashboard_id = $1
       and story_id is null
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
           (dashboard_id, channel_id, position, title, url, image, is_new)
         select $1, $2, t.i - 1, t.title, t.url, t.image, true
         from unnest($3::text[], $4::text[], $5::text[])
           with ordinality as t(title, url, image, i)
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
