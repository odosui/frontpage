-- +migrate up

-- Articles get three ways to be grouped, all of them optional:
--
--   storyline   the running arc — "Russian-Ukrainian war", weeks or months
--     story     one event inside it — "Attack on Novorossiysk", merging the
--               several outlets that covered it
--       article the individual headline we pulled from a channel
--
-- plus tags, which cut across the tree instead of nesting.
--
-- Everything is scoped to a dashboard, like channels and articles are, and the
-- slugs are unique per dashboard rather than globally. The links between the
-- levels are plain single-column foreign keys: a composite (dashboard_id, id)
-- key would also stop a story from joining another dashboard's storyline, but
-- its ON DELETE SET NULL needs a column list to leave the not-null dashboard_id
-- alone, and that syntax is postgres 15+ while dev machines here run 14. Keeping
-- both sides on the same dashboard is the api's job.

create table storylines (
  id           bigserial primary key,
  dashboard_id text not null
    references dashboards (id) on delete cascade on update cascade,
  title        text not null,
  slug         text not null,
  created_at   timestamptz not null default now(),
  unique (dashboard_id, slug)
);

create table stories (
  id           bigserial primary key,
  dashboard_id text not null
    references dashboards (id) on delete cascade on update cascade,
  -- a story can stand alone, and losing its storyline must not lose the story
  storyline_id bigint references storylines (id) on delete set null,
  title        text not null,
  slug         text not null,
  created_at   timestamptz not null default now(),
  unique (dashboard_id, slug)
);

create index stories_storyline_idx
  on stories (dashboard_id, storyline_id, created_at desc);

create table tags (
  id           bigserial primary key,
  dashboard_id text not null
    references dashboards (id) on delete cascade on update cascade,
  name         text not null,
  slug         text not null,
  created_at   timestamptz not null default now(),
  unique (dashboard_id, slug)
);

-- likewise: ungrouping an article must not delete it
alter table articles
  add column story_id bigint references stories (id) on delete set null;

create index articles_story_idx on articles (dashboard_id, story_id, position);

-- Tags are many-to-many, so they need the join table the hierarchy doesn't.
create table article_tags (
  article_id bigint not null references articles (id) on delete cascade,
  tag_id     bigint not null references tags (id) on delete cascade,
  primary key (article_id, tag_id)
);

-- the reverse lookup: every article carrying a tag
create index article_tags_tag_idx on article_tags (tag_id);

-- +migrate down

drop table article_tags;

drop index articles_story_idx;
alter table articles drop column story_id;

drop table tags;
drop index stories_storyline_idx;
drop table stories;
drop table storylines;
