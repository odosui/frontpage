import { query } from "../db/pool";

export const PROPOSAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "failed",
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export type Proposal = {
  id: number;
  sessionId: number;
  dashboardId: string;
  kind: string;
  payload: Record<string, unknown>;
  summary: string;
  status: ProposalStatus;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  decidedAt: string | null;
};

type Row = {
  id: string;
  session_id: string;
  dashboard_id: string;
  kind: string;
  payload: Record<string, unknown>;
  summary: string;
  status: ProposalStatus;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: Date;
  decided_at: Date | null;
};

const COLUMNS = `id, session_id, dashboard_id, kind, payload, summary, status,
                 result, error, created_at, decided_at`;

function toProposal(row: Row): Proposal {
  return {
    id: Number(row.id),
    sessionId: Number(row.session_id),
    dashboardId: row.dashboard_id,
    kind: row.kind,
    payload: row.payload,
    summary: row.summary,
    status: row.status,
    result: row.result,
    error: row.error,
    createdAt: row.created_at.toISOString(),
    decidedAt: row.decided_at?.toISOString() ?? null,
  };
}

export type NewProposal = {
  sessionId: number;
  dashboardId: string;
  kind: string;
  payload: Record<string, unknown>;
  summary: string;
};

export async function create(proposal: NewProposal): Promise<Proposal> {
  const { rows } = await query<Row>(
    `insert into agent_proposals
       (session_id, dashboard_id, kind, payload, summary)
     values ($1, $2, $3, $4::jsonb, $5)
     returning ${COLUMNS}`,
    [
      proposal.sessionId,
      proposal.dashboardId,
      proposal.kind,
      JSON.stringify(proposal.payload),
      proposal.summary,
    ],
  );
  return toProposal(rows[0]!);
}

export async function get(id: number): Promise<Proposal | null> {
  const { rows } = await query<Row>(
    `select ${COLUMNS} from agent_proposals where id = $1`,
    [id],
  );
  return rows[0] ? toProposal(rows[0]) : null;
}

/** Everything this conversation has asked for, oldest first. */
export async function forSession(sessionId: number): Promise<Proposal[]> {
  const { rows } = await query<Row>(
    `select ${COLUMNS} from agent_proposals
      where session_id = $1 order by id`,
    [sessionId],
  );
  return rows.map(toProposal);
}

/**
 * Claims a pending proposal, so two clicks on the same button cannot carry the
 * same merge out twice. Returns null when it was already decided.
 */
export async function claim(id: number): Promise<Proposal | null> {
  const { rows } = await query<Row>(
    `update agent_proposals
        set status = 'approved', decided_at = now()
      where id = $1 and status = 'pending'
      returning ${COLUMNS}`,
    [id],
  );
  return rows[0] ? toProposal(rows[0]) : null;
}

export async function reject(id: number): Promise<Proposal | null> {
  const { rows } = await query<Row>(
    `update agent_proposals
        set status = 'rejected', decided_at = now()
      where id = $1 and status = 'pending'
      returning ${COLUMNS}`,
    [id],
  );
  return rows[0] ? toProposal(rows[0]) : null;
}

export async function succeeded(
  id: number,
  result: Record<string, unknown>,
): Promise<Proposal> {
  const { rows } = await query<Row>(
    `update agent_proposals set result = $2::jsonb
      where id = $1 returning ${COLUMNS}`,
    [id, JSON.stringify(result)],
  );
  return toProposal(rows[0]!);
}

/** An approved proposal that could not be carried out keeps the reason. */
export async function failed(id: number, error: string): Promise<Proposal> {
  const { rows } = await query<Row>(
    `update agent_proposals set status = 'failed', error = $2
      where id = $1 returning ${COLUMNS}`,
    [id, error],
  );
  return toProposal(rows[0]!);
}
