-- +migrate up

-- An agent run: a model working a task by calling functions we expose to it,
-- one row per conversation. Kept separate from `jobs` — a job is one unit of
-- work the worker retries, a session is a dialogue that may outlive several
-- jobs and, later, take input from a human through a chat interface.
create table agent_sessions (
  id           bigserial primary key,
  kind         text not null,
  -- null when the agent works across every dashboard, as the categorizing one does
  dashboard_id text
    references dashboards (id) on delete cascade on update cascade,
  status       text not null default 'running'
    check (status in ('running', 'finished', 'failed')),
  model        text not null,
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  finished_at  timestamptz
);

-- the sessions list, newest first, per kind
create index agent_sessions_recent_idx on agent_sessions (kind, created_at desc);

-- Every turn of the conversation, in order — what we sent, what the model
-- answered, and what each function it called returned. This is the audit trail
-- for "why did the agent decide that", and the transcript a chat ui would show.
create table agent_messages (
  id                bigserial primary key,
  session_id        bigint not null
    references agent_sessions (id) on delete cascade,
  -- 0-based turn number; the conversation is replayed in this order
  position          integer not null,
  role              text not null
    check (role in ('system', 'user', 'assistant', 'tool')),
  content           text not null,
  -- role = 'tool': which function produced this content, and with what arguments
  tool_name         text,
  tool_args         jsonb,
  -- role = 'assistant': what the call cost, so a session can be priced
  model             text,
  prompt_tokens     integer,
  completion_tokens integer,
  created_at        timestamptz not null default now(),
  unique (session_id, position)
);

create index agent_messages_session_idx on agent_messages (session_id, position);

-- +migrate down

drop table agent_messages;
drop table agent_sessions;
