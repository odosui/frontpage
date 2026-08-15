-- +migrate up

-- An agent lives inside one dashboard: every function it can call sees only
-- that dashboard's storylines and tags, and everything it writes lands there.
-- A session with no dashboard has no meaning any more.
update agent_sessions set dashboard_id = 'default' where dashboard_id is null;

alter table agent_sessions
  alter column dashboard_id set not null;

-- the sessions list is always scoped to a dashboard now
drop index agent_sessions_recent_idx;
create index agent_sessions_recent_idx
  on agent_sessions (dashboard_id, kind, created_at desc);

-- +migrate down

drop index agent_sessions_recent_idx;
create index agent_sessions_recent_idx on agent_sessions (kind, created_at desc);

alter table agent_sessions
  alter column dashboard_id drop not null;
