import { query, withTransaction } from "../db/pool";

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

/**
 * One line of what a dashboard is taken to have established. It has no row of
 * its own — it lives inside a version's array — so the id is a label the
 * dashboard hands out ("f7") rather than a key, stable across versions so the
 * same fact can be followed as it is rewritten.
 */
export type Fact = {
  id: string;
  content: string;
  confidence: number;
  /** The article it rests on, when it rests on one we hold. */
  articleId: number | null;
  /**
   * When the fact was first written down, not when this version was: it rides
   * across every revision that keeps the fact, so the recent ones stay
   * findable however often the set around them is rewritten.
   */
  createdAt: string;
};

/** A fact with its citation resolved, for display. */
export type FactWithSource = Fact & {
  articleTitle: string | null;
  articleUrl: string | null;
};

export type Author = "reader" | "analyst";

/**
 * The whole set as it stood at one point, and why it changed. Rows are never
 * updated — a revision is a new version — so a list of these is the history of
 * what the arc was taken to know.
 */
export type FactsVersion = {
  id: number;
  dashboardId: string;
  version: number;
  facts: FactWithSource[];
  author: Author;
  /** Why the set was revised. Required of the analyst, optional for the reader. */
  reasoning: string | null;
  createdAt: string;
};

type Row = {
  id: string;
  dashboard_id: string;
  version: number;
  facts: StoredFact[] | null;
  author: Author;
  reasoning: string | null;
  created_at: Date;
};

/** As it comes back out of jsonb: shaped by us, but not typed by the database. */
type StoredFact = {
  id?: string;
  content?: string;
  confidence?: number;
  articleId?: number | null;
  createdAt?: string;
};

const SELECT = `select id, dashboard_id, version, facts, author,
                       reasoning, created_at
                  from fact_versions`;

/** What the dashboard page and the analyst's opening context both read. */
export async function current(
  dashboardId: string,
): Promise<FactsVersion | null> {
  const { rows } = await query<Row>(
    `${SELECT}
      where dashboard_id = $1
      order by version desc
      limit 1`,
    [dashboardId],
  );
  if (!rows[0]) return null;
  return (await hydrate(rows))[0]!;
}

/** The current facts alone — the common case, with no version to unwrap. */
export async function forDashboard(
  dashboardId: string,
): Promise<FactWithSource[]> {
  return (await current(dashboardId))?.facts ?? [];
}

/** Newest first, the current version included. */
export async function history(
  dashboardId: string,
  limit = 50,
): Promise<FactsVersion[]> {
  const { rows } = await query<Row>(
    `${SELECT}
      where dashboard_id = $1
      order by version desc
      limit $2`,
    [dashboardId, limit],
  );
  return hydrate(rows);
}

/** A fact on its way in: an id only when it is one that already exists. */
export type FactDraft = {
  id?: string | undefined;
  content: string;
  confidence?: number | undefined;
  articleId?: number | null | undefined;
};

export type Revision = {
  facts: FactDraft[];
  author: Author;
  reasoning?: string | null | undefined;
};

/**
 * Writes the set as it now stands, as the next version. The whole list is
 * given every time: what is left out is dropped, which is how a fact is
 * deleted.
 *
 * Drafts carrying an id keep it, so the fact stays the same fact across the
 * revision; the ones without get a fresh one, counted past every id this
 * dashboard has ever handed out rather than past the current set — a number
 * that once meant one fact should never come back meaning another.
 *
 * A kept fact keeps the date it was first written down too. Only what is
 * genuinely new is stamped now, which is what lets the list be read newest
 * first without a rewrite of the set shuffling everything to the top.
 */
export async function revise(
  dashboardId: string,
  revision: Revision,
): Promise<FactsVersion> {
  return withTransaction(async (client) => {
    // serializes concurrent revisions of the same arc: the second waits, then
    // numbers itself off the first rather than colliding with it
    await client.query("select 1 from dashboards where id = $1 for update", [
      dashboardId,
    ]);

    // what each surviving fact was first written down, by id
    const { rows: previous } = await client.query<{ facts: StoredFact[] | null }>(
      `select facts from fact_versions
        where dashboard_id = $1
        order by version desc
        limit 1`,
      [dashboardId],
    );
    const born = new Map<string, string>();
    for (const fact of previous[0]?.facts ?? []) {
      if (fact.id && fact.createdAt) born.set(fact.id, fact.createdAt);
    }

    const { rows: maxRows } = await client.query<{ next: number }>(
      `select coalesce(
                max((substring(f ->> 'id' from '^f([0-9]+)$'))::int), 0
              ) + 1 as next
         from fact_versions v, jsonb_array_elements(v.facts) f
        where v.dashboard_id = $1`,
      [dashboardId],
    );
    let next = maxRows[0]?.next ?? 1;

    const now = new Date().toISOString();
    const taken = new Set<string>();
    const facts: Fact[] = [];
    for (const draft of revision.facts) {
      const content = draft.content.trim();
      if (!content) continue;

      // a duplicated id would make two facts one; the second is treated as the
      // new fact it evidently is
      const id =
        draft.id && !taken.has(draft.id) ? draft.id : `f${next++}`;
      taken.add(id);

      facts.push({
        id,
        content,
        confidence: clamp(draft.confidence ?? DEFAULT_CONFIDENCE),
        articleId: draft.articleId ?? null,
        createdAt: born.get(id) ?? now,
      });
    }

    // newest first, the order the page and the agent's context both read in.
    // The id breaks a tie: several facts written in one revision share a
    // timestamp, and the later one in the list is the later one written
    facts.sort(
      (a, b) =>
        Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
        order(b.id) - order(a.id),
    );

    const { rows } = await client.query<Row>(
      `insert into fact_versions
         (dashboard_id, version, facts, author, reasoning)
       select $1::text,
              coalesce(max(version), 0) + 1,
              $2::jsonb, $3::text, $4::text
         from fact_versions
        where dashboard_id = $1
       returning id, dashboard_id, version, facts, author,
                 reasoning, created_at`,
      [
        dashboardId,
        JSON.stringify(facts),
        revision.author,
        revision.reasoning?.trim() || null,
      ],
    );
    return (await hydrate(rows))[0]!;
  });
}

/** Out-of-range confidence is pulled to the nearest rung rather than rejected. */
export function clamp(confidence: number): number {
  if (!Number.isFinite(confidence)) return DEFAULT_CONFIDENCE;
  return Math.min(
    MAX_CONFIDENCE,
    Math.max(MIN_CONFIDENCE, Math.round(confidence)),
  );
}

/**
 * Fills in the headline and url behind each citation. One query for every
 * version being returned: the history panel shows a dozen at a time and each
 * of them would otherwise be a round trip of its own.
 *
 * An article that has since been deleted resolves to nothing, and the fact
 * keeps its number — losing the citation must not lose the fact.
 */
async function hydrate(rows: Row[]): Promise<FactsVersion[]> {
  const ids = new Set<number>();
  for (const row of rows) {
    for (const fact of row.facts ?? []) {
      if (typeof fact.articleId === "number") ids.add(fact.articleId);
    }
  }

  const sources = new Map<number, { title: string; url: string }>();
  if (ids.size > 0) {
    const { rows: articles } = await query<{
      id: string;
      title: string;
      url: string;
    }>(`select id, title, url from articles where id = any($1::bigint[])`, [
      [...ids],
    ]);
    for (const a of articles) {
      sources.set(Number(a.id), { title: a.title, url: a.url });
    }
  }

  return rows.map((row) => ({
    id: Number(row.id),
    dashboardId: row.dashboard_id,
    version: row.version,
    author: row.author,
    reasoning: row.reasoning,
    createdAt: row.created_at.toISOString(),
    facts: (row.facts ?? []).map((fact) => {
      const articleId =
        typeof fact.articleId === "number" ? fact.articleId : null;
      const source = articleId === null ? undefined : sources.get(articleId);
      return {
        id: fact.id ?? "",
        content: fact.content ?? "",
        confidence: clamp(fact.confidence ?? DEFAULT_CONFIDENCE),
        articleId,
        // a fact written before facts were dated is as old as its version
        createdAt: fact.createdAt ?? row.created_at.toISOString(),
        articleTitle: source?.title ?? null,
        articleUrl: source?.url ?? null,
      };
    }),
  }));
}

/** "f12" sorts after "f2" — the label is a number wearing a letter. */
function order(id: string): number {
  const n = Number(id.replace(/^f/, ""));
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}
