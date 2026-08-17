-- +migrate up

-- Facts, but versioned as a set rather than kept as editable rows.
--
-- What a storyline establishes is one document, not a bag of independent
-- lines: raising the confidence on one fact usually happens *because* of what
-- another one now says, and a per-row edit threw that away — the old table
-- kept only the latest wording, with no record that it had ever said anything
-- else. Here every revision writes a whole new row: the complete list as it
-- stood, who wrote it, and why. Nothing is ever updated in place, so the
-- history of what this arc was taken to know reads back in order.
--
-- `facts` is an array of objects, newest first:
--   [{"id": "f3", "content": "...", "confidence": 2, "articleId": 9241,
--     "createdAt": "2026-08-17T09:00:00.000Z"}, ...]
-- The id is stable across versions, so the same fact can be followed from one
-- to the next, and `createdAt` is when it was first written down rather than
-- when this version was — a fact carried across ten revisions keeps its own
-- age, which is what makes the newest ones findable. `articleId` is a plain
-- number rather than a foreign key, so a deleted article leaves a citation
-- that no longer resolves instead of taking the fact with it.
create table fact_versions (
  id           bigserial primary key,
  dashboard_id text not null
    references dashboards (id) on delete cascade on update cascade,
  storyline_id bigint not null
    references storylines (id) on delete cascade,
  -- 1 upwards, per storyline
  version      integer not null,
  facts        jsonb not null default '[]'::jsonb,
  -- who revised it; the reader through the ui, or the analyst through its tool
  author       text not null default 'reader'
    check (author in ('reader', 'analyst')),
  -- why the set changed. The analyst is made to give one; the reader's own
  -- edits usually speak for themselves, so it is null there
  reasoning    text,
  created_at   timestamptz not null default now(),
  unique (dashboard_id, storyline_id, version)
);

-- reading the current set is `order by version desc limit 1`, and the history
-- panel walks the same index
create index fact_versions_latest_idx
  on fact_versions (dashboard_id, storyline_id, version desc);

-- Everything already written down becomes v1 of its storyline, newest first,
-- each fact keeping the day it was actually written rather than inheriting the
-- version's.
insert into fact_versions
  (dashboard_id, storyline_id, version, facts, author, created_at)
select f.dashboard_id,
       f.storyline_id,
       1,
       jsonb_agg(
         jsonb_build_object(
           'id', 'f' || f.id,
           'content', f.content,
           'confidence', f.confidence,
           'articleId', f.article_id,
           'createdAt', to_char(
             f.created_at at time zone 'UTC',
             'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
           )
         )
         order by f.created_at desc, f.id desc
       ),
       'reader',
       min(f.created_at)
from facts f
group by f.dashboard_id, f.storyline_id;

drop table facts;

-- +migrate down

create table facts (
  id           bigserial primary key,
  dashboard_id text not null
    references dashboards (id) on delete cascade on update cascade,
  storyline_id bigint not null
    references storylines (id) on delete cascade,
  content      text not null,
  confidence   smallint not null default 3
    check (confidence between 1 and 5),
  article_id   bigint references articles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index facts_storyline_idx
  on facts (dashboard_id, storyline_id, confidence desc, id);

-- The latest version of each storyline becomes rows again. The history and the
-- old row ids are lost — going back is a rollback, not a round trip.
insert into facts
  (dashboard_id, storyline_id, content, confidence, article_id,
   created_at, updated_at)
select v.dashboard_id,
       v.storyline_id,
       e ->> 'content',
       (e ->> 'confidence')::smallint,
       (e ->> 'articleId')::bigint,
       coalesce((e ->> 'createdAt')::timestamptz, v.created_at),
       v.created_at
from fact_versions v
join lateral jsonb_array_elements(v.facts) e on true
where v.version = (
  select max(x.version) from fact_versions x
   where x.dashboard_id = v.dashboard_id
     and x.storyline_id = v.storyline_id
);

drop table fact_versions;
