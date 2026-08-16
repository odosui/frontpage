-- +migrate up

-- Something an agent wants to do to the data, waiting on a person to say yes.
--
-- Every tool until now only read. A tool that rewrites what has been filed
-- cannot be allowed to act on its own judgement — an agent that merges two
-- stories it misread has destroyed work no undo puts back. So the tool writes
-- its intent here and stops; the merge happens later, from the reader's click,
-- against exactly the rows named in this row's payload.
--
-- It doubles as the record of what was asked and what was decided, which is
-- worth keeping whichever way the answer went.
create table agent_proposals (
  id           bigserial primary key,
  session_id   bigint not null
    references agent_sessions (id) on delete cascade,
  dashboard_id text not null
    references dashboards (id) on delete cascade on update cascade,
  -- what is being proposed; only 'merge_stories' so far
  kind         text not null,
  -- the whole of the action, as the tool described it: for a merge, the new
  -- title and the ids being folded into it. Read back at approval time, so an
  -- approved proposal does what was shown, not what the world looks like now.
  payload      jsonb not null,
  -- what the agent said it was for, shown to the reader beside the buttons
  summary      text not null,
  status       text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'failed')),
  -- what carrying it out actually did, or why it could not
  result       jsonb,
  error        text,
  created_at   timestamptz not null default now(),
  decided_at   timestamptz
);

-- the chat asks for one session's proposals every time it polls
create index agent_proposals_session_idx on agent_proposals (session_id, id);

-- +migrate down

drop table agent_proposals;
