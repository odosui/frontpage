-- +migrate up

-- "Unread" never meant anything here: nobody marks an article read, and a
-- fetch that found the page unchanged cleared the flag wholesale. What the
-- reader actually wants flagged is an article the categorizing agent has not
-- filed yet, and that is already derivable from story_id / skipped_at.
alter table articles drop column is_new;

-- +migrate down

alter table articles add column is_new boolean not null default false;
