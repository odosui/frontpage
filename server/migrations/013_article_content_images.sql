-- +migrate up

-- The pictures inside an article, as urls — never the bytes. Each entry is
-- { url, alt, caption }: text only, pointing at the publisher's own copy, which
-- the reader's browser loads from there the way opening the page would.
--
-- Kept beside `content` rather than in a table of their own: they are read and
-- written only with the article's text, and never queried across articles.
alter table articles
  add column content_images jsonb not null default '[]'::jsonb;

-- +migrate down

alter table articles drop column content_images;
