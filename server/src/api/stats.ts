import { getPool, query } from "../db/pool";

export type TableStat = {
  name: string;
  rows: number;
  bytes: number;
};

export type ServerStats = {
  postgres: {
    version: string;
    startedAt: string | null;
    settings: Record<string, string>;
    connections: { active: number; idle: number; total: number; max: number };
    cacheHitRatio: number | null;
    commits: number;
    rollbacks: number;
    deadlocks: number;
    tempBytes: number;
    statsResetAt: string | null;
  };
  node: {
    version: string;
    platform: string;
    uptimeSec: number;
    rssBytes: number;
    heapUsedBytes: number;
    heapTotalBytes: number;
  };
  pool: { total: number; idle: number; waiting: number; max: number };
};

export type DatabaseStats = {
  server: ServerStats;
  database: { name: string; bytes: number };
  tables: TableStat[];
  content: {
    dashboards: number;
    sources: number;
    articles: number;
    filings: number;
    stories: number;
    sourcesWithoutUrl: number;
    sourcesNeverFetched: number;
    unreadSources: number;
    newestArticleAt: string | null;
    oldestArticleAt: string | null;
  };
  snapshots: {
    count: number;
    bytes: number;
    oldestAt: string | null;
  };
  jobs: {
    byStatus: Record<string, number>;
    last24h: { total: number; succeeded: number; failed: number };
    avgDurationSec: number | null;
    oldestQueuedAt: string | null;
  };
  dashboards: {
    id: string;
    name: string;
    sources: number;
    articles: number;
    stories: number;
    uncategorized: number;
    lastFetchedAt: string | null;
  }[];
};

export async function collect(): Promise<DatabaseStats> {
  const [server, size, tables, content, snapshots, jobs, byStatus, perDashboard] =
    await Promise.all([
      serverStats(),
      databaseSize(),
      tableStats(),
      contentStats(),
      snapshotStats(),
      jobStats(),
      jobsByStatus(),
      dashboardStats(),
    ]);

  return {
    server,
    database: size,
    tables,
    content,
    snapshots,
    jobs: { ...jobs, byStatus },
    dashboards: perDashboard,
  };
}

const SETTINGS = [
  "shared_buffers",
  "effective_cache_size",
  "work_mem",
  "maintenance_work_mem",
  "max_connections",
];

async function serverStats(): Promise<ServerStats> {
  const [general, settings, connections, activity] = await Promise.all([
    query<{ version: string; started_at: string | null }>(
      `select current_setting('server_version') as version,
              pg_postmaster_start_time()        as started_at`,
    ),
    query<{ name: string; value: string }>(
      "select name, current_setting(name) as value from pg_settings where name = any($1)",
      [SETTINGS],
    ),
    // other users' backends show up here with a null state, so treat anything
    // that isn't explicitly active/idle as "other" and only count the total
    query<{ active: string; idle: string; total: string }>(
      `select count(*) filter (where state = 'active') as active,
              count(*) filter (where state = 'idle')   as idle,
              count(*)                                 as total
       from pg_stat_activity
       where datname = current_database()`,
    ),
    query<Record<string, string | null>>(
      `select blks_hit, blks_read, xact_commit, xact_rollback,
              deadlocks, temp_bytes, stats_reset
       from pg_stat_database where datname = current_database()`,
    ),
  ]);

  const values = Object.fromEntries(
    settings.rows.map((r) => [r.name, r.value]),
  );
  const a = activity.rows[0] ?? {};
  const hit = Number(a.blks_hit ?? 0);
  const read = Number(a.blks_read ?? 0);
  const mem = process.memoryUsage();
  const pool = getPool();

  return {
    postgres: {
      version: general.rows[0]?.version ?? "",
      startedAt: iso(general.rows[0]?.started_at ?? null),
      settings: values,
      connections: {
        active: Number(connections.rows[0]?.active ?? 0),
        idle: Number(connections.rows[0]?.idle ?? 0),
        total: Number(connections.rows[0]?.total ?? 0),
        max: Number(values.max_connections ?? 0),
      },
      cacheHitRatio: hit + read > 0 ? hit / (hit + read) : null,
      commits: Number(a.xact_commit ?? 0),
      rollbacks: Number(a.xact_rollback ?? 0),
      deadlocks: Number(a.deadlocks ?? 0),
      tempBytes: Number(a.temp_bytes ?? 0),
      statsResetAt: iso(a.stats_reset ?? null),
    },
    node: {
      version: process.version,
      platform: `${process.platform}/${process.arch}`,
      uptimeSec: Math.round(process.uptime()),
      rssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      heapTotalBytes: mem.heapTotal,
    },
    pool: {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
      max: pool.options.max ?? 0,
    },
  };
}

async function databaseSize() {
  const { rows } = await query<{ name: string; bytes: string }>(
    `select current_database() as name,
            pg_database_size(current_database()) as bytes`,
  );
  return { name: rows[0]?.name ?? "", bytes: Number(rows[0]?.bytes ?? 0) };
}

/** Identifiers safe to interpolate; the catalogue never yields anything else. */
const PLAIN_IDENT = /^[a-z_][a-z0-9_]*$/;

/**
 * Every table in the public schema, discovered rather than listed: a hardcoded
 * list silently stops reporting whatever the next migration adds.
 *
 * Live row estimates come from the planner stats, which can lag; the tables
 * here are small enough to just count them for real.
 */
async function tableStats(): Promise<TableStat[]> {
  const { rows: tables } = await query<{ name: string }>(
    `select tablename as name from pg_tables
     where schemaname = 'public'
     order by tablename`,
  );

  const names = tables.map((t) => t.name).filter((n) => PLAIN_IDENT.test(n));
  if (names.length === 0) return [];

  const counts = names
    .map((t) => `select '${t}' as name, count(*)::bigint as rows from "${t}"`)
    .join(" union all ");

  const { rows } = await query<{ name: string; rows: string; bytes: string }>(
    `select c.name, c.rows, pg_total_relation_size(c.name::regclass) as bytes
     from (${counts}) c
     order by bytes desc, c.name`,
  );

  return rows.map((r) => ({
    name: r.name,
    rows: Number(r.rows),
    bytes: Number(r.bytes),
  }));
}

async function contentStats() {
  const { rows } = await query<Record<string, string | null>>(
    `select (select count(*) from dashboards)                      as dashboards,
            (select count(*) from sources)                         as sources,
            (select count(*) from articles)                        as articles,
            (select count(*) from article_filings)                 as filings,
            (select count(*) from stories)                         as stories,
            (select count(*) from sources where url = '')          as sources_without_url,
            (select count(*) from sources where fetched_at is null) as sources_never_fetched,
            -- a source nobody reads still costs a fetch and a row per article
            (select count(*) from sources s
              where not exists (select 1 from dashboard_sources ds
                                 where ds.source_id = s.id))       as unread_sources,
            (select max(created_at) from articles)                 as newest_article_at,
            (select min(created_at) from articles)                 as oldest_article_at`,
  );
  const r = rows[0] ?? {};
  return {
    dashboards: Number(r.dashboards ?? 0),
    sources: Number(r.sources ?? 0),
    articles: Number(r.articles ?? 0),
    filings: Number(r.filings ?? 0),
    stories: Number(r.stories ?? 0),
    sourcesWithoutUrl: Number(r.sources_without_url ?? 0),
    sourcesNeverFetched: Number(r.sources_never_fetched ?? 0),
    unreadSources: Number(r.unread_sources ?? 0),
    newestArticleAt: iso(r.newest_article_at),
    oldestArticleAt: iso(r.oldest_article_at),
  };
}

/** Snapshots hold raw page html, so they dominate storage — worth calling out. */
async function snapshotStats() {
  const { rows } = await query<{
    count: string;
    bytes: string | null;
    oldest_at: string | null;
  }>(
    `select count(*)                    as count,
            sum(pg_column_size(html))   as bytes,
            min(created_at)             as oldest_at
     from page_snapshots`,
  );
  const r = rows[0];
  return {
    count: Number(r?.count ?? 0),
    bytes: Number(r?.bytes ?? 0),
    oldestAt: iso(r?.oldest_at ?? null),
  };
}

async function jobStats() {
  const { rows } = await query<Record<string, string | null>>(
    `select count(*) filter (where created_at > now() - interval '24 hours')
              as total_24h,
            count(*) filter (where created_at > now() - interval '24 hours'
                               and status = 'succeeded')
              as succeeded_24h,
            count(*) filter (where created_at > now() - interval '24 hours'
                               and status = 'failed')
              as failed_24h,
            avg(extract(epoch from (finished_at - started_at)))
              filter (where status = 'succeeded'
                        and finished_at is not null
                        and started_at is not null
                        and created_at > now() - interval '24 hours')
              as avg_duration_sec,
            min(created_at) filter (where status = 'queued')
              as oldest_queued_at
     from jobs`,
  );
  const r = rows[0] ?? {};
  const avg = r.avg_duration_sec;
  return {
    last24h: {
      total: Number(r.total_24h ?? 0),
      succeeded: Number(r.succeeded_24h ?? 0),
      failed: Number(r.failed_24h ?? 0),
    },
    avgDurationSec: avg === null || avg === undefined ? null : Number(avg),
    oldestQueuedAt: iso(r.oldest_queued_at ?? null),
  };
}

async function jobsByStatus(): Promise<Record<string, number>> {
  const { rows } = await query<{ status: string; count: string }>(
    "select status, count(*) as count from jobs group by status",
  );
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
}

/**
 * Per dashboard, everything is counted through `dashboard_sources`: an article
 * is not the dashboard's, it is the dashboard's *source's*, so two arcs
 * reading one outlet both count the same rows. That double counting is the
 * honest answer to "how much is this arc looking at".
 *
 * Subqueries rather than joins: joining sources and articles together would
 * multiply the two counts by each other.
 */
async function dashboardStats() {
  const { rows } = await query<{
    id: string;
    name: string;
    sources: string;
    articles: string;
    stories: string;
    uncategorized: string;
    last_fetched_at: string | null;
  }>(
    `select d.id, d.name,
            (select count(*) from dashboard_sources ds
              where ds.dashboard_id = d.id)                        as sources,
            (select count(*) from articles a
              where a.source_id in (select ds.source_id
                                      from dashboard_sources ds
                                     where ds.dashboard_id = d.id)) as articles,
            (select count(*) from stories s
              where s.dashboard_id = d.id)                          as stories,
            (select count(*) from articles a
              where a.source_id in (select ds.source_id
                                      from dashboard_sources ds
                                     where ds.dashboard_id = d.id)
                and not exists (select 1 from article_filings f
                                 where f.dashboard_id = d.id
                                   and f.article_id = a.id
                                   and (f.story_id is not null
                                        or f.skipped_at is not null)))
                                                                    as uncategorized,
            (select max(s.fetched_at) from sources s
              where s.id in (select ds.source_id from dashboard_sources ds
                              where ds.dashboard_id = d.id))        as last_fetched_at
       from dashboards d
      order by articles desc, d.id`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sources: Number(r.sources),
    articles: Number(r.articles),
    stories: Number(r.stories),
    uncategorized: Number(r.uncategorized),
    lastFetchedAt: iso(r.last_fetched_at),
  }));
}

function iso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}
