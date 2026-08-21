-- +migrate up

-- What the feed said the article was, kept for when the page will not tell us.
--
-- Most publishers put a teaser in `content:encoded` — The Verge's ends "Read
-- the full story at The Verge", Ars Technica's "Read full article" — so this
-- is not the article's text and must not be stored as if it were: reading the
-- page gives a far better answer, and `content` stays that answer.
--
-- What it is for is the case where there is no better answer to be had. RBC's
-- pages sit behind a Qrator javascript challenge that 401s every request we
-- can make, homepage included, while its feed carries every article in full in
-- `rbc_news:full-text`. Without this column those articles are headlines and
-- nothing else.

alter table articles
  add column feed_content text;

comment on column articles.feed_content is
  'The body as the feed gave it — often only a teaser. Used as the article text when the page itself cannot be read, never in preference to it.';

-- +migrate down

alter table articles
  drop column feed_content;
