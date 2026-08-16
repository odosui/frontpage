-- +migrate up

-- The article's own text, pulled from its page on demand. Separate from
-- `description` (the outlet's blurb, which arrives with the feed) because this
-- is the whole piece and it is fetched one article at a time, by hand.
--
-- `content_at` says when we read it: a null content with a null timestamp has
-- never been tried, and it is the timestamp that lets a later re-read tell
-- itself apart from a first one.
alter table articles
  add column content    text,
  add column content_at timestamptz;

-- the feed asks "does this one have text yet" for every row it renders, and
-- never wants the text itself, so keep the answer out of the toasted column
create index articles_with_content_idx
  on articles (dashboard_id)
  where content is not null;

-- +migrate down

drop index articles_with_content_idx;

alter table articles
  drop column content_at,
  drop column content;
