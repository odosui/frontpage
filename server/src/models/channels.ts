import { query } from "../db/pool";
import { Channel } from "../api/types";

export async function list(dashboardId: string): Promise<Channel[]> {
  const { rows } = await query<Channel>(
    `select id, kind, url from channels
     where dashboard_id = $1
     order by position, id`,
    [dashboardId],
  );
  return rows;
}

export async function get(
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

export async function add(dashboardId: string, channel: Channel) {
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

export async function remove(
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
