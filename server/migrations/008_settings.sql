-- +migrate up

-- Instance-wide settings the reader can change from the ui.
--
-- Deliberately a key/value table rather than a one-row table with a column per
-- setting: what belongs here is the handful of knobs that used to be constants
-- in the source, and adding the next one should not cost a migration.
--
-- Values are text. Nothing here is hot enough to want a typed column, and the
-- reader that owns each key knows what shape it wants back.
create table settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

comment on table settings is
  'Instance-wide settings edited from the settings page. Absent key = use the built-in default.';

-- +migrate down

drop table settings;
