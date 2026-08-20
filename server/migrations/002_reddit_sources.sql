-- +migrate up

-- Reddit as a source, and the thing it drags in behind it.
--
-- A subreddit is not an outlet. Most of what scores well on r/futurology is a
-- link to somebody else's article, and that article is the thing worth having
-- — not the reddit thread wrapped around it. So a reddit fetch stores the
-- destination: nature.com's headline, nature.com's url.
--
-- Which leaves the question of who that article belongs to, since nature.com
-- is not a source anyone configured. It belongs to the subreddit that carried
-- it: `source_id` means "which of our sources delivered this", and that is
-- what routes an article to the dashboards reading that sub. Where it was
-- actually published is `publisher`, plain text, because we hold no row for
-- nature.com and should not have to invent one.

alter table sources
  drop constraint sources_kind_check,
  add constraint sources_kind_check
    check (kind in ('web', 'rss', 'reddit', 'telegram', 'twitter'));

-- Per-source knobs, as one column rather than one column per kind: a reddit
-- source carries {"minScore": 20}, and the kinds still to come will each want
-- something of their own that means nothing to the others.
alter table sources
  add column config jsonb not null default '{}'::jsonb;

alter table articles
  -- Nullable now. Everything we fetch still arrives through a source, but an
  -- article no longer *requires* one — which is what lets something added by
  -- hand, or found by an agent, exist without a fake source row standing
  -- behind it. Nothing writes a null yet; see the index below for what
  -- happens to dedupe when something does.
  alter column source_id drop not null,
  -- Who published it, for display: "nature.com". Null for everything fetched
  -- straight from its own source, where the source's name already says it —
  -- so this is only filled in when the two differ, as they do for a link
  -- somebody posted to reddit.
  add column publisher text,
  -- Where it was posted, when it reached us by being posted somewhere: the
  -- reddit permalink. The article is the payload; this is the conversation
  -- about it, and it is worth one click.
  add column via_url text;

-- `unique (source_id, url)` cannot dedupe rows whose source is null, since in
-- sql null is not equal to null and every such row is distinct from every
-- other. This covers exactly that gap, so an article with no source is still
-- stored once.
create unique index articles_unsourced_url_idx
  on articles (url) where source_id is null;

-- +migrate down

drop index articles_unsourced_url_idx;

alter table articles
  drop column via_url,
  drop column publisher;

-- a null source has no home once the column is mandatory again
delete from articles where source_id is null;

alter table articles
  alter column source_id set not null;

alter table sources drop column config;

alter table sources
  drop constraint sources_kind_check,
  add constraint sources_kind_check
    check (kind in ('web', 'rss', 'telegram', 'twitter'));
