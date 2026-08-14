import { query } from "../db/pool";

export const AGENT_STATUSES = ["running", "finished", "failed"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const MESSAGE_ROLES = ["system", "user", "assistant", "tool"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export type AgentSession = {
  id: number;
  kind: string;
  dashboardId: string | null;
  status: AgentStatus;
  model: string;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
};

export type AgentMessage = {
  id: number;
  sessionId: number;
  position: number;
  role: MessageRole;
  content: string;
  toolName: string | null;
  toolArgs: string[] | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  createdAt: string;
};

/** What `append` needs; the position is assigned by the insert itself. */
export type NewMessage = {
  role: MessageRole;
  content: string;
  toolName?: string;
  toolArgs?: string[];
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
};

type SessionRow = {
  id: string;
  kind: string;
  dashboard_id: string | null;
  status: AgentStatus;
  model: string;
  error: string | null;
  created_at: Date;
  finished_at: Date | null;
};

type MessageRow = {
  id: string;
  session_id: string;
  position: number;
  role: MessageRole;
  content: string;
  tool_name: string | null;
  tool_args: string[] | null;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  created_at: Date;
};

const SESSION_COLUMNS = `id, kind, dashboard_id, status, model, error,
                         created_at, finished_at`;

const MESSAGE_COLUMNS = `id, session_id, position, role, content, tool_name,
                         tool_args, model, prompt_tokens, completion_tokens,
                         created_at`;

function toSession(row: SessionRow): AgentSession {
  return {
    id: Number(row.id),
    kind: row.kind,
    dashboardId: row.dashboard_id,
    status: row.status,
    model: row.model,
    error: row.error,
    createdAt: row.created_at.toISOString(),
    finishedAt: row.finished_at?.toISOString() ?? null,
  };
}

function toMessage(row: MessageRow): AgentMessage {
  return {
    id: Number(row.id),
    sessionId: Number(row.session_id),
    position: row.position,
    role: row.role,
    content: row.content,
    toolName: row.tool_name,
    toolArgs: row.tool_args,
    model: row.model,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    createdAt: row.created_at.toISOString(),
  };
}

export async function start(
  kind: string,
  model: string,
  dashboardId?: string,
): Promise<AgentSession> {
  const { rows } = await query<SessionRow>(
    `insert into agent_sessions (kind, model, dashboard_id)
     values ($1, $2, $3)
     returning ${SESSION_COLUMNS}`,
    [kind, model, dashboardId ?? null],
  );
  return toSession(rows[0]!);
}

/**
 * Appends a turn. The position comes from the row count under a lock on the
 * session, so two writers can't hand out the same one — the unique constraint
 * on (session_id, position) would reject the second anyway.
 */
export async function append(
  sessionId: number,
  message: NewMessage,
): Promise<AgentMessage> {
  const { rows } = await query<MessageRow>(
    `insert into agent_messages
       (session_id, position, role, content, tool_name, tool_args,
        model, prompt_tokens, completion_tokens)
     select $1,
            coalesce((select max(position) + 1 from agent_messages
                      where session_id = $1), 0),
            $2, $3, $4, $5::jsonb, $6, $7, $8
     from agent_sessions where id = $1 for update
     returning ${MESSAGE_COLUMNS}`,
    [
      sessionId,
      message.role,
      message.content,
      message.toolName ?? null,
      message.toolArgs ? JSON.stringify(message.toolArgs) : null,
      message.model ?? null,
      message.promptTokens ?? null,
      message.completionTokens ?? null,
    ],
  );
  return toMessage(rows[0]!);
}

export async function messages(sessionId: number): Promise<AgentMessage[]> {
  const { rows } = await query<MessageRow>(
    `select ${MESSAGE_COLUMNS} from agent_messages
     where session_id = $1 order by position`,
    [sessionId],
  );
  return rows.map(toMessage);
}

export async function finish(sessionId: number): Promise<void> {
  await query(
    `update agent_sessions
     set status = 'finished', finished_at = now(), updated_at = now()
     where id = $1`,
    [sessionId],
  );
}

export async function fail(sessionId: number, error: string): Promise<void> {
  await query(
    `update agent_sessions
     set status = 'failed', error = $2, finished_at = now(), updated_at = now()
     where id = $1`,
    [sessionId, error],
  );
}

export async function list(
  kind: string | undefined,
  limit: number,
): Promise<AgentSession[]> {
  const { rows } = await query<SessionRow>(
    `select ${SESSION_COLUMNS} from agent_sessions
     where ($1::text is null or kind = $1)
     order by created_at desc, id desc
     limit $2`,
    [kind ?? null, limit],
  );
  return rows.map(toSession);
}
