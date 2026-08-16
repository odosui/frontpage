-- +migrate up

-- The one date everything sorts by. `published_at` is what the reader means by
-- "when did this happen", but only feed channels supply it, so `created_at` —
-- when we first saw the article — stands in where it is missing. `least`
-- ignores nulls, so it is exactly that fallback, and it also keeps a publisher
-- who post-dates an item from pinning it to the top of the feed forever.
alter table articles
  add column sorted_at timestamptz
    generated always as (least(published_at, created_at)) stored;

-- mirrors articles_dashboard_recent_idx, which orders by created_at
create index articles_dashboard_sorted_idx
  on articles (dashboard_id, sorted_at desc, position);

-- +migrate down

drop index articles_dashboard_sorted_idx;

alter table articles drop column sorted_at;
