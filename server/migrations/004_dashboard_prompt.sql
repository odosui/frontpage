-- +migrate up

-- A dashboard's own standing instruction to the agents reading it.
--
-- Every agent gets the same general brief and its own job description, neither
-- of which knows anything about the particular arc it is pointed at. What an
-- arc needs said — which side calls itself what, which outlet to discount,
-- which thread of the story matters and which is noise — belongs to the
-- dashboard rather than to any one run, so it is kept here and appended to the
-- system message of every run and every chat turn on that dashboard.

alter table dashboards
  add column prompt text not null default '';

comment on column dashboards.prompt is
  'Extra standing instruction appended to the system message of every agent run on this dashboard. Empty when the reader has set none.';

-- +migrate down

alter table dashboards
  drop column prompt;
