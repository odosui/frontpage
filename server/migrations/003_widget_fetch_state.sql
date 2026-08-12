-- +migrate up

-- Lets fetch_page ask "has this page actually changed?" before paying for a
-- model call: HTTP validators for a 304, plus a hash of the last page we
-- successfully analyzed.
alter table widgets
  add column etag          text,
  add column last_modified text,
  add column content_hash  text,
  add column fetched_at    timestamptz;

-- +migrate down

alter table widgets
  drop column etag,
  drop column last_modified,
  drop column content_hash,
  drop column fetched_at;
