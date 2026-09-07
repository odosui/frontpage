-- +migrate up

alter table agent_sessions add column title text;
create index agent_sessions_activity_idx
  on agent_sessions (dashboard_id, updated_at desc, id desc);

-- +migrate down

drop index agent_sessions_activity_idx;
alter table agent_sessions drop column title;
