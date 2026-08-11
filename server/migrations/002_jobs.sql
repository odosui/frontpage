-- +migrate up

create table jobs (
  id           bigserial primary key,
  type         text not null,
  status       text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  payload      jsonb not null default '{}'::jsonb,
  result       jsonb,
  error        text,
  attempts     integer not null default 0,
  max_attempts integer not null default 3,
  run_at       timestamptz not null default now(),
  locked_by    text,
  locked_at    timestamptz,
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- the claim query: oldest runnable job first
create index jobs_claim_idx on jobs (run_at, id) where status = 'queued';

-- requeueing jobs abandoned by a dead worker
create index jobs_locked_idx on jobs (locked_at) where status = 'running';

-- the jobs panel lists newest first
create index jobs_recent_idx on jobs (created_at desc);

-- Cleaned page html handed from a fetch_page job to its analyze_page job.
-- Kept out of jobs.payload so the queue table stays small.
create table page_snapshots (
  id         bigserial primary key,
  url        text not null,
  html       text not null,
  hrefs      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index page_snapshots_created_idx on page_snapshots (created_at);

-- +migrate down

drop table page_snapshots;
drop table jobs;
