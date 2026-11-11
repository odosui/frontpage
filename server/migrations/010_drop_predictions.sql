-- +migrate up
-- Predictions are gone from the app: the reader no longer writes claims and
-- no agent forecasts them. Their tables go, along with the runs and
-- conversations of the predictions agent, which no longer exists to answer
-- them, and any of its jobs still waiting in the queue.

delete from jobs where type = 'run_predictions' and status in ('queued', 'running');
delete from agent_sessions where kind = 'predictions_agent';

drop table forecasts;
drop table predictions;

-- +migrate down
-- The tables come back empty, in the shape 003 left them: what was dropped
-- is not recoverable from here.

create table predictions (
  id           bigserial primary key,
  dashboard_id text not null
    references dashboards (id) on delete cascade on update cascade,
  content      text not null,
  likelihood   smallint
    constraint predictions_likelihood_check check (likelihood between 1 and 5),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index predictions_dashboard_idx on predictions (dashboard_id, id);

create table forecasts (
  id            bigserial primary key,
  prediction_id bigint not null
    references predictions (id) on delete cascade,
  likelihood    smallint not null
    constraint forecasts_likelihood_check check (likelihood between 1 and 5),
  previous      smallint
    constraint forecasts_previous_check check (previous between 1 and 5),
  reasoning     text not null,
  author        text not null default 'analyst'
    check (author in ('analyst', 'reader')),
  created_at    timestamptz not null default now()
);

create index forecasts_prediction_idx
  on forecasts (prediction_id, created_at desc, id desc);
