import { query } from "../db/pool";
import { Source, SourceConfig, SourceKind } from "../api/types";

type Row = {
  id: string;
  name: string;
  kind: SourceKind;
  url: string;
  config: SourceConfig | null;
  fetched_at: Date | null;
  article_count: string;
  dashboard_count: string;
};

const SELECT = `select s.id, s.name, s.kind, s.url, s.config, s.fetched_at,
                       (select count(*) from articles a where a.source_id = s.id)
                         as article_count,
                       (select count(*) from dashboard_sources ds
                         where ds.source_id = s.id) as dashboard_count
                  from sources s`;

function toSource(row: Row): Source {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    url: row.url,
    config: row.config ?? {},
    fetchedAt: row.fetched_at?.toISOString() ?? null,
    articleCount: Number(row.article_count),
    dashboardCount: Number(row.dashboard_count),
  };
}

/** Every source there is, whoever reads it — what the settings page lists. */
export async function all(): Promise<Source[]> {
  const { rows } = await query<Row>(`${SELECT} order by s.name, s.id`);
  return rows.map(toSource);
}

export async function get(id: string): Promise<Source | null> {
  const { rows } = await query<Row>(`${SELECT} where s.id = $1`, [id]);
  return rows[0] ? toSource(rows[0]) : null;
}

/** The sources one dashboard pulls from, in the order it put them in. */
export async function forDashboard(dashboardId: string): Promise<Source[]> {
  const { rows } = await query<Row>(
    `${SELECT}
       join dashboard_sources ds on ds.source_id = s.id
      where ds.dashboard_id = $1
      order by ds.position, s.id`,
    [dashboardId],
  );
  return rows.map(toSource);
}

/** Just the ids, for the client-side "is this job mine" check. */
export async function idsForDashboard(dashboardId: string): Promise<string[]> {
  const { rows } = await query<{ source_id: string }>(
    `select source_id from dashboard_sources
      where dashboard_id = $1 order by position, source_id`,
    [dashboardId],
  );
  return rows.map((r) => r.source_id);
}

export type NewSource = {
  id: string;
  name: string;
  kind: SourceKind;
  url: string;
  config?: SourceConfig;
};

/** Creates the source, or updates the one already carrying this id. */
export async function upsert(source: NewSource): Promise<Source> {
  await query(
    `insert into sources (id, name, kind, url, config)
     values ($1, $2, $3, $4, $5::jsonb)
     on conflict (id) do update
       set name   = excluded.name,
           kind   = excluded.kind,
           url    = excluded.url,
           config = excluded.config`,
    [
      source.id,
      source.name,
      source.kind,
      source.url,
      JSON.stringify(source.config ?? {}),
    ],
  );
  return (await get(source.id))!;
}

/** Deletes the source everywhere, taking its articles with it. */
export async function remove(id: string): Promise<boolean> {
  const { rowCount } = await query("delete from sources where id = $1", [id]);
  return rowCount === 1;
}

/**
 * Points a dashboard at a source. Idempotent — assigning twice is the reader
 * clicking twice, not an error — and appended at the end of their list.
 */
export async function assign(
  dashboardId: string,
  sourceId: string,
): Promise<void> {
  await query(
    `insert into dashboard_sources (dashboard_id, source_id, position)
     values (
       $1, $2,
       coalesce(
         (select max(position) + 1 from dashboard_sources where dashboard_id = $1),
         0
       )
     )
     on conflict (dashboard_id, source_id) do nothing`,
    [dashboardId, sourceId],
  );
}

/**
 * Stops a dashboard reading a source. The source itself and its articles stay
 * — another dashboard may be reading them, and even where none is, unassigning
 * is not deleting.
 */
export async function unassign(
  dashboardId: string,
  sourceId: string,
): Promise<boolean> {
  const { rowCount } = await query(
    "delete from dashboard_sources where dashboard_id = $1 and source_id = $2",
    [dashboardId, sourceId],
  );
  return rowCount === 1;
}

/** Whether this dashboard reads this source — the check every route makes. */
export async function isAssigned(
  dashboardId: string,
  sourceId: string,
): Promise<boolean> {
  const { rowCount } = await query(
    "select 1 from dashboard_sources where dashboard_id = $1 and source_id = $2",
    [dashboardId, sourceId],
  );
  return rowCount === 1;
}

/** Every dashboard reading this source — who has to reload after a fetch. */
export async function dashboardsOf(sourceId: string): Promise<string[]> {
  const { rows } = await query<{ dashboard_id: string }>(
    "select dashboard_id from dashboard_sources where source_id = $1",
    [sourceId],
  );
  return rows.map((r) => r.dashboard_id);
}

export type FetchState = {
  etag: string | null;
  lastModified: string | null;
  contentHash: string | null;
};

export async function getFetchState(id: string): Promise<FetchState | null> {
  const { rows } = await query<{
    etag: string | null;
    last_modified: string | null;
    content_hash: string | null;
  }>("select etag, last_modified, content_hash from sources where id = $1", [
    id,
  ]);
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
  id: string,
  validators: { etag?: string | null; lastModified?: string | null },
) {
  await query(
    `update sources
        set etag = $2, last_modified = $3, fetched_at = now()
      where id = $1`,
    [id, validators.etag ?? null, validators.lastModified ?? null],
  );
}

/** Recorded only after a successful analysis — see fetch_page's skip check. */
export async function saveContentHash(id: string, hash: string) {
  await query("update sources set content_hash = $2 where id = $1", [id, hash]);
}
