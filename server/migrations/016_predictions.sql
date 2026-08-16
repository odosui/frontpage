-- +migrate up

-- A claim about what happens next, written by the reader. Facts are what the
-- storyline has established; a prediction is what it points to and has not
-- settled yet.
--
-- The reader writes the claim and leaves the number alone. Putting a
-- probability on it is the analyst's job, and it is a job it does again every
-- time the coverage moves.
create table predictions (
  id           bigserial primary key,
  dashboard_id text not null
    references dashboards (id) on delete cascade on update cascade,
  storyline_id bigint not null
    references storylines (id) on delete cascade,
  content      text not null,
  -- 0-100, or null until it has been forecast for the first time. Kept here as
  -- well as in `forecasts` so the list can be read without touching the
  -- history — this is always the newest forecast's probability
  probability  smallint
    check (probability between 0 and 100),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index predictions_storyline_idx
  on predictions (dashboard_id, storyline_id, id);

-- One estimate, with why. A probability that moves without a reason is
-- unreviewable: months later the only way to judge a forecaster — human or
-- model — is to read what it thought at the time, so every move is kept rather
-- than overwriting the last.
create table forecasts (
  id            bigserial primary key,
  prediction_id bigint not null
    references predictions (id) on delete cascade,
  probability   smallint not null
    check (probability between 0 and 100),
  -- what it was before this, so a move can be read without its neighbours.
  -- Null for the first forecast, which moved from nothing
  previous      smallint
    check (previous between 0 and 100),
  -- never empty: the reason is the point of the record
  reasoning     text not null,
  -- who moved it, for when the two disagree
  author        text not null default 'analyst'
    check (author in ('analyst', 'reader')),
  created_at    timestamptz not null default now()
);

create index forecasts_prediction_idx
  on forecasts (prediction_id, created_at desc, id desc);

-- +migrate down

drop table forecasts;
drop table predictions;
