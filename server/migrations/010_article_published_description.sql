-- +migrate up

-- What a feed tells us that a front page does not. `created_at` is when we
-- first saw an article, which is not when it was published: a feed we poll for
-- the first time hands us a week of back-catalogue all stamped "now".
--
-- Both stay null for web channels — the extraction model is asked for links,
-- not for prose it would have to invent a date for.
alter table articles
  add column published_at timestamptz,
  add column description  text;

-- +migrate down

alter table articles
  drop column description,
  drop column published_at;
