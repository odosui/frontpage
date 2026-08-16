import { query } from "../db/pool";

/** 1 someone said it, 5 established beyond doubt. */
export const MIN_CONFIDENCE = 1;
export const MAX_CONFIDENCE = 5;
export const DEFAULT_CONFIDENCE = 3;

/** What each rung means, for the ui and for the agent's instructions alike. */
export const CONFIDENCE_LABELS: Record<number, string> = {
  1: "rumour",
  2: "one source",
  3: "reported",
  4: "corroborated",
  5: "certain",
};

export type Fact = {
  id: number;
  dashboardId: string;
  storylineId: number;
  content: string;
  confidence: number;
  /** The article it rests on, when it rests on one we hold. */
  articleId: number | null;
  /** Denormalized for display: the source's headline and where it came from. */
  articleTitle: string | null;
  articleUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  dashboard_id: string;
  storyline_id: string;
  content: string;
  confidence: number;
  article_id: string | null;
  article_title: string | null;
  article_url: string | null;
  created_at: Date;
  updated_at: Date;
};

const SELECT = `select f.id, f.dashboard_id, f.storyline_id, f.content,
                       f.confidence, f.article_id,
                       a.title as article_title, a.url as article_url,
                       f.created_at, f.updated_at
                from facts f
                left join articles a on a.id = f.article_id`;

function toFact(row: Row): Fact {
  return {
    id: Number(row.id),
    dashboardId: row.dashboard_id,
    storylineId: Number(row.storyline_id),
    content: row.content,
    confidence: row.confidence,
    articleId: row.article_id ? Number(row.article_id) : null,
    articleTitle: row.article_title,
    articleUrl: row.article_url,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Surest first — what the analyst should read before the shakier ones. */
export async function forStoryline(
  dashboardId: string,
  storylineId: number,
): Promise<Fact[]> {
  const { rows } = await query<Row>(
    `${SELECT}
     where f.dashboard_id = $1 and f.storyline_id = $2
     order by f.confidence desc, f.id`,
    [dashboardId, storylineId],
  );
  return rows.map(toFact);
}

export async function get(
  dashboardId: string,
  id: number,
): Promise<Fact | null> {
  const { rows } = await query<Row>(
    `${SELECT} where f.dashboard_id = $1 and f.id = $2`,
    [dashboardId, id],
  );
  return rows[0] ? toFact(rows[0]) : null;
}

export type NewFact = {
  dashboardId: string;
  storylineId: number;
  content: string;
  confidence?: number;
  articleId?: number | null;
};

export async function create(fact: NewFact): Promise<Fact> {
  const { rows } = await query<{ id: string }>(
    `insert into facts (dashboard_id, storyline_id, content, confidence, article_id)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [
      fact.dashboardId,
      fact.storylineId,
      fact.content.trim(),
      clamp(fact.confidence ?? DEFAULT_CONFIDENCE),
      fact.articleId ?? null,
    ],
  );
  return (await get(fact.dashboardId, Number(rows[0]!.id)))!;
}

export type FactPatch = {
  content?: string;
  confidence?: number;
  articleId?: number | null;
};

/**
 * Changes only what was passed. A fact is edited far more often than it is
 * replaced — usually the confidence moves as a story firms up — so leaving a
 * field out has to mean "as it was", not "empty".
 */
export async function update(
  dashboardId: string,
  id: number,
  patch: FactPatch,
): Promise<Fact | null> {
  const { rowCount } = await query(
    `update facts
        set content = coalesce($3, content),
            confidence = coalesce($4, confidence),
            article_id = case when $5::boolean then $6 else article_id end,
            updated_at = now()
      where dashboard_id = $1 and id = $2`,
    [
      dashboardId,
      id,
      patch.content?.trim() ?? null,
      patch.confidence === undefined ? null : clamp(patch.confidence),
      // told apart from "leave it alone", since null is a meaningful value here
      patch.articleId !== undefined,
      patch.articleId ?? null,
    ],
  );
  if (!rowCount) return null;
  return get(dashboardId, id);
}

export async function remove(
  dashboardId: string,
  id: number,
): Promise<boolean> {
  const { rowCount } = await query(
    `delete from facts where dashboard_id = $1 and id = $2`,
    [dashboardId, id],
  );
  return (rowCount ?? 0) > 0;
}

/** Out-of-range confidence is pulled to the nearest rung rather than rejected. */
export function clamp(confidence: number): number {
  if (!Number.isFinite(confidence)) return DEFAULT_CONFIDENCE;
  return Math.min(
    MAX_CONFIDENCE,
    Math.max(MIN_CONFIDENCE, Math.round(confidence)),
  );
}
