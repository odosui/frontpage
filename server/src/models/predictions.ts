import { query, withTransaction } from "../db/pool";

/** 1 highly unlikely, 5 highly likely. The same five rungs a fact's confidence uses. */
export const MIN_LIKELIHOOD = 1;
export const MAX_LIKELIHOOD = 5;
export const DEFAULT_LIKELIHOOD = 3;

/** What each rung means, for the ui and for the agent's instructions alike. */
export const LIKELIHOOD_LABELS: Record<number, string> = {
  1: "highly unlikely",
  2: "unlikely",
  3: "even odds",
  4: "likely",
  5: "highly likely",
};

/** One estimate of a prediction's odds, and why it was made. */
export type Forecast = {
  id: number;
  likelihood: number;
  /** What it was before; null for the first forecast. */
  previous: number | null;
  reasoning: string;
  author: "analyst" | "reader";
  createdAt: string;
};

export type Prediction = {
  id: number;
  dashboardId: string;
  content: string;
  /** The newest forecast's rung, 1-5; null until it has been forecast. */
  likelihood: number | null;
  /** Newest first — the whole of how the estimate has moved. */
  forecasts: Forecast[];
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  dashboard_id: string;
  content: string;
  likelihood: number | null;
  created_at: Date;
  updated_at: Date;
};

type ForecastRow = {
  id: string;
  prediction_id: string;
  likelihood: number;
  previous: number | null;
  reasoning: string;
  author: "analyst" | "reader";
  created_at: Date;
};

function toForecast(row: ForecastRow): Forecast {
  return {
    id: Number(row.id),
    likelihood: row.likelihood,
    previous: row.previous,
    reasoning: row.reasoning,
    author: row.author,
    createdAt: row.created_at.toISOString(),
  };
}

function toPrediction(row: Row, forecasts: Forecast[]): Prediction {
  return {
    id: Number(row.id),
    dashboardId: row.dashboard_id,
    content: row.content,
    likelihood: row.likelihood,
    forecasts,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const COLUMNS = `id, dashboard_id, content, likelihood,
                 created_at, updated_at`;

/** The arc's predictions with their whole history, oldest claim first. */
export async function forDashboard(
  dashboardId: string,
): Promise<Prediction[]> {
  const { rows } = await query<Row>(
    `select ${COLUMNS} from predictions
      where dashboard_id = $1
      order by id`,
    [dashboardId],
  );
  if (rows.length === 0) return [];

  const { rows: forecastRows } = await query<ForecastRow>(
    `select id, prediction_id, likelihood, previous, reasoning, author,
            created_at
       from forecasts
      where prediction_id = any($1::bigint[])
      order by created_at desc, id desc`,
    [rows.map((r) => Number(r.id))],
  );

  const history = new Map<number, Forecast[]>();
  for (const row of forecastRows) {
    const list = history.get(Number(row.prediction_id)) ?? [];
    list.push(toForecast(row));
    history.set(Number(row.prediction_id), list);
  }

  return rows.map((row) => toPrediction(row, history.get(Number(row.id)) ?? []));
}

export async function get(
  dashboardId: string,
  id: number,
): Promise<Prediction | null> {
  const { rows } = await query<Row>(
    `select ${COLUMNS} from predictions where dashboard_id = $1 and id = $2`,
    [dashboardId, id],
  );
  if (!rows[0]) return null;

  const { rows: forecastRows } = await query<ForecastRow>(
    `select id, prediction_id, likelihood, previous, reasoning, author,
            created_at
       from forecasts where prediction_id = $1
      order by created_at desc, id desc`,
    [id],
  );
  return toPrediction(rows[0], forecastRows.map(toForecast));
}

/** Written by the reader, with no number on it yet. */
export async function create(
  dashboardId: string,
  content: string,
): Promise<Prediction> {
  const { rows } = await query<{ id: string }>(
    `insert into predictions (dashboard_id, content)
     values ($1, $2) returning id`,
    [dashboardId, content.trim()],
  );
  return (await get(dashboardId, Number(rows[0]!.id)))!;
}

export async function updateContent(
  dashboardId: string,
  id: number,
  content: string,
): Promise<Prediction | null> {
  const { rowCount } = await query(
    `update predictions set content = $3, updated_at = now()
      where dashboard_id = $1 and id = $2`,
    [dashboardId, id, content.trim()],
  );
  if (!rowCount) return null;
  return get(dashboardId, id);
}

export async function remove(
  dashboardId: string,
  id: number,
): Promise<boolean> {
  const { rowCount } = await query(
    `delete from predictions where dashboard_id = $1 and id = $2`,
    [dashboardId, id],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Moves the odds and records why, in one transaction: the likelihood on the
 * prediction is only ever the newest forecast's, and a move stored without its
 * reason — or a reason without the move — would be worse than neither.
 */
export async function forecast(
  dashboardId: string,
  id: number,
  likelihood: number,
  reasoning: string,
  author: Forecast["author"] = "analyst",
): Promise<Prediction | null> {
  const reason = reasoning.trim();
  if (!reason) throw new Error("a forecast needs its reasoning");

  const clamped = clamp(likelihood);

  const moved = await withTransaction(async (client) => {
    const { rows } = await client.query<{ likelihood: number | null }>(
      `select likelihood from predictions
        where dashboard_id = $1 and id = $2 for update`,
      [dashboardId, id],
    );
    const existing = rows[0];
    if (!existing) return false;

    await client.query(
      `insert into forecasts (prediction_id, likelihood, previous, reasoning, author)
       values ($1, $2, $3, $4, $5)`,
      [id, clamped, existing.likelihood, reason, author],
    );
    await client.query(
      `update predictions set likelihood = $2, updated_at = now()
        where id = $1`,
      [id, clamped],
    );
    return true;
  });

  return moved ? get(dashboardId, id) : null;
}

/** Out-of-range odds are pulled to the nearest rung rather than rejected. */
export function clamp(likelihood: number): number {
  if (!Number.isFinite(likelihood)) return DEFAULT_LIKELIHOOD;
  return Math.min(
    MAX_LIKELIHOOD,
    Math.max(MIN_LIKELIHOOD, Math.round(likelihood)),
  );
}
