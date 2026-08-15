-- +migrate up

-- When the categorizing agent looks at an article and says it is not news —
-- an affiliate deal post, a horoscope, a recipe — the article used to keep a
-- null story_id, which is exactly what the work queue selects on: it came back
-- in every later batch, was rejected again, and crowded out real articles.
-- Stamping the rejection takes it out of the queue for good.
alter table articles
  add column skipped_at timestamptz,
  add column skipped_reason text;

-- the work queue reads "unfiled and not rejected", so it wants both columns
create index articles_uncategorized_idx
  on articles (dashboard_id, created_at desc)
  where story_id is null and skipped_at is null;

-- +migrate down

drop index articles_uncategorized_idx;

alter table articles
  drop column skipped_reason,
  drop column skipped_at;
