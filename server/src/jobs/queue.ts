import { QueryResult, QueryResultRow } from "pg";
import { query, withTransaction } from "../db/pool";
import { Job, JobStatus, NewJob } from "./types";

/** Whatever can run a query — the pool helper or a transaction's client. */
type Queryable = {
  query<T extends QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
};

type JobRow = {
  id: string;
  type: string;
  status: JobStatus;
  payload: Record<string, unknown>;
  result: unknown;
  error: string | null;
  attempts: number;
  max_attempts: number;
  run_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const COLUMNS = `id, type, status, payload, result, error, attempts,
                 max_attempts, run_at, started_at, finished_at,
                 created_at, updated_at`;

function toJob(row: JobRow): Job {
  return {
    id: String(row.id),
    type: row.type,
    status: row.status,
    payload: row.payload,
    result: row.result,
    error: row.error,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    runAt: row.run_at.toISOString(),
    startedAt: row.started_at?.toISOString() ?? null,
    finishedAt: row.finished_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function insert(
  client: Queryable,
  job: NewJob,
): Promise<Job> {
  const { rows } = await client.query<JobRow>(
    `insert into jobs (type, payload, max_attempts, run_at)
     values ($1, $2::jsonb, coalesce($3, 3),
             now() + make_interval(secs => $4::float8))
     returning ${COLUMNS}`,
    [
      job.type,
      JSON.stringify(job.payload ?? {}),
      job.maxAttempts ?? null,
      (job.delayMs ?? 0) / 1000,
    ],
  );
  return toJob(rows[0]!);
}

export function enqueue(job: NewJob): Promise<Job> {
  return insert({ query }, job);
}

export function enqueueMany(
  client: Queryable,
  jobs: NewJob[],
): Promise<Job[]> {
  return Promise.all(jobs.map((j) => insert(client, j)));
}

/**
 * Take the oldest runnable job. `skip locked` lets several workers poll the
 * same table without blocking or handing out the same row twice.
 */
export async function claim(workerId: string): Promise<Job | null> {
  const { rows } = await query<JobRow>(
    `update jobs
     set status = 'running',
         attempts = attempts + 1,
         started_at = coalesce(started_at, now()),
         locked_by = $1,
         locked_at = now(),
         updated_at = now()
     where id = (
       select id from jobs
       where status = 'queued' and run_at <= now()
       order by run_at, id
       for update skip locked
       limit 1
     )
     returning ${COLUMNS}`,
    [workerId],
  );
  return rows[0] ? toJob(rows[0]) : null;
}

/** Mark succeeded and enqueue any follow-up jobs atomically. */
export function succeed(
  jobId: string,
  result: Record<string, unknown> | undefined,
  followUps: NewJob[],
): Promise<Job[]> {
  return withTransaction(async (client) => {
    await client.query(
      `update jobs
       set status = 'succeeded', result = $2::jsonb, error = null,
           finished_at = now(), locked_by = null, locked_at = null,
           updated_at = now()
       where id = $1`,
      [jobId, result ? JSON.stringify(result) : null],
    );
    return enqueueMany(client, followUps);
  });
}

/**
 * Record a failure. Retries with exponential backoff while attempts remain,
 * otherwise parks the job in `failed`.
 */
export async function fail(
  jobId: string,
  message: string,
  backoffMs: number,
): Promise<JobStatus> {
  const { rows } = await query<{ status: JobStatus }>(
    `update jobs
     set status = case when attempts < max_attempts then 'queued' else 'failed' end,
         error = $2,
         run_at = case when attempts < max_attempts
                       then now() + make_interval(secs => $3::float8)
                       else run_at end,
         finished_at = case when attempts < max_attempts then null else now() end,
         locked_by = null, locked_at = null, updated_at = now()
     where id = $1
     returning status`,
    [jobId, message, backoffMs / 1000],
  );
  return rows[0]?.status ?? "failed";
}

/** Hand jobs abandoned by a crashed worker back to the queue. */
export async function requeueStale(olderThanMs: number): Promise<number> {
  const { rowCount } = await query(
    `update jobs
     set status = case when attempts < max_attempts then 'queued' else 'failed' end,
         error = 'worker stopped responding',
         finished_at = case when attempts < max_attempts then null else now() end,
         locked_by = null, locked_at = null, updated_at = now()
     where status = 'running'
       and locked_at < now() - make_interval(secs => $1::float8)`,
    [olderThanMs / 1000],
  );
  return rowCount ?? 0;
}

/** Drop old finished jobs and orphaned page snapshots. */
export async function prune(olderThanMs: number): Promise<number> {
  const seconds = olderThanMs / 1000;
  const { rowCount } = await query(
    `delete from jobs
     where status in ('succeeded', 'failed')
       and finished_at < now() - make_interval(secs => $1::float8)`,
    [seconds],
  );
  await query(
    `delete from page_snapshots
     where created_at < now() - make_interval(secs => $1::float8)`,
    [seconds],
  );
  return rowCount ?? 0;
}

export async function list(opts: {
  status?: JobStatus | undefined;
  limit: number;
}): Promise<Job[]> {
  const { rows } = await query<JobRow>(
    `select ${COLUMNS} from jobs
     where ($1::text is null or status = $1)
     order by created_at desc, id desc
     limit $2`,
    [opts.status ?? null, opts.limit],
  );
  return rows.map(toJob);
}

export type JobStats = Record<JobStatus, number>;

export async function stats(): Promise<JobStats> {
  const { rows } = await query<{ status: JobStatus; count: string }>(
    "select status, count(*)::text as count from jobs group by status",
  );
  const out: JobStats = { queued: 0, running: 0, succeeded: 0, failed: 0 };
  for (const r of rows) out[r.status] = Number(r.count);
  return out;
}
