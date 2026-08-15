-- +migrate up

-- How much this article matters, 1 (routine) to 10 (world-changing), as judged
-- by the categorizing agent. Null until an article has been through a run, so
-- an uncategorized article is distinguishable from one scored as unimportant.
alter table articles
  add column importance smallint
  check (importance is null or importance between 1 and 10);

-- the feed wants the most important story first within a batch
create index articles_importance_idx
  on articles (dashboard_id, importance desc nulls last, created_at desc);

-- +migrate down

drop index articles_importance_idx;

alter table articles drop column importance;
