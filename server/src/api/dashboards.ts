import { query, withTransaction } from "../db/pool";
import { Article, Channel, FeedArticle } from "./types";

const DEFAULT_DASHBOARD = "default";

export function resolveId(id: string): string {
  return id || DEFAULT_DASHBOARD;
}

export function isDefault(id: string): boolean {
  return id === DEFAULT_DASHBOARD;
}

/** Dashboard ids double as their display name, so keep them url-safe. */
export function slugify(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "");
}

export async function ensureDefaultDashboard() {
  await query(
    `insert into dashboards (id, name) values ($1, $1)
     on conflict (id) do nothing`,
    [DEFAULT_DASHBOARD],
  );
}

export async function listAll(): Promise<string[]> {
  await ensureDefaultDashboard();
  const { rows } = await query<{ id: string }>(
    `select id from dashboards
     order by (id = $1) desc, created_at, id`,
    [DEFAULT_DASHBOARD],
  );
  return rows.map((r) => r.id);
}

export async function exists(id: string): Promise<boolean> {
  const { rowCount } = await query("select 1 from dashboards where id = $1", [
    id,
  ]);
  return rowCount === 1;
}

export async function create(id: string, name: string) {
  await query("insert into dashboards (id, name) values ($1, $2)", [id, name]);
}

export async function remove(id: string) {
  await query("delete from dashboards where id = $1", [id]);
}

/** Channels and articles follow via `on update cascade`. */
export async function rename(oldId: string, newId: string) {
  await query("update dashboards set id = $1, name = $2 where id = $3", [
    newId,
    newId,
    oldId,
  ]);
}

// Channels

export async function listChannels(dashboardId: string): Promise<Channel[]> {
  const { rows } = await query<Channel>(
    `select id, kind, url from channels
     where dashboard_id = $1
     order by position, id`,
    [dashboardId],
  );
  return rows;
}

export async function getChannel(
  dashboardId: string,
  channelId: string,
): Promise<Channel | null> {
  const { rows } = await query<Channel>(
    `select id, kind, url from channels
     where dashboard_id = $1 and id = $2`,
    [dashboardId, channelId],
  );
  return rows[0] ?? null;
}

export async function addChannel(dashboardId: string, channel: Channel) {
  await query(
    `insert into channels (dashboard_id, id, position, kind, url)
     values (
       $1, $2,
       coalesce((select max(position) + 1 from channels where dashboard_id = $1), 0),
       $3, $4
     )
     on conflict (dashboard_id, id) do update
       set kind = excluded.kind, url = excluded.url`,
    [dashboardId, channel.id, channel.kind, channel.url],
  );
}

export async function deleteChannel(
  dashboardId: string,
  channelId: string,
): Promise<boolean> {
  const { rowCount } = await query(
    "delete from channels where dashboard_id = $1 and id = $2",
    [dashboardId, channelId],
  );
  return rowCount === 1;
}

export type FetchState = {
  etag: string | null;
  lastModified: string | null;
  contentHash: string | null;
};

export async function getFetchState(
  dashboardId: string,
  channelId: string,
): Promise<FetchState | null> {
  const { rows } = await query<{
    etag: string | null;
    last_modified: string | null;
    content_hash: string | null;
  }>(
    `select etag, last_modified, content_hash
     from channels where dashboard_id = $1 and id = $2`,
    [dashboardId, channelId],
  );
  const row = rows[0];
  return row
    ? {
        etag: row.etag,
        lastModified: row.last_modified,
        contentHash: row.content_hash,
      }
    : null;
}

export async function saveValidators(
  dashboardId: string,
  channelId: string,
  validators: { etag?: string | null; lastModified?: string | null },
) {
  await query(
    `update channels
     set etag = $3, last_modified = $4, fetched_at = now()
     where dashboard_id = $1 and id = $2`,
    [
      dashboardId,
      channelId,
      validators.etag ?? null,
      validators.lastModified ?? null,
    ],
  );
}

/** Recorded only after a successful analysis — see fetch_page's skip check. */
export async function saveContentHash(
  dashboardId: string,
  channelId: string,
  hash: string,
) {
  await query(
    "update channels set content_hash = $3 where dashboard_id = $1 and id = $2",
    [dashboardId, channelId, hash],
  );
}

// Articles

/**
 * Every article on the dashboard, newest first, whichever channel it came from.
 * Articles stored in the same refresh share a `created_at`, so `position` — the
 * order the source listed them in — breaks the tie.
 */
export async function getFeed(
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

/**
 * Put `items` at the top of a channel's list, marked as new, demoting whatever
 * was already there. Items whose url is already stored are skipped. Runs under
 * a row lock so concurrent refreshes can't interleave. Returns the resulting
 * list, capped at `limit`.
 */
export function prependArticles(
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
export function replaceArticles(
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
