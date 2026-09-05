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
  /**
   * The articles it rests on, oldest citation first — a claim is reported
   * once and then corroborated, dated or extended elsewhere, and all of that
   * is what the fact stands on. Empty when it rests on nothing we hold.
   */
  articleIds: number[];
  /**
   * When the fact was first written down, not when this version was: it rides
   * across every revision that keeps the fact, so the recent ones stay
   * findable however often the set around them is rewritten.
   */
  createdAt: string;
};

/** One resolved citation: the article behind it, as far as we still hold it. */
export type FactSource = {
  id: number;
  title: string;
  url: string;
};

/**
 * A fact with its citations resolved, for display. An article that has since
 * been deleted simply drops out of `sources` — the fact keeps its ids either
 * way, so losing an article never loses the fact or its other citations.
 */
export type FactWithSource = Fact & {
  sources: FactSource[];
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
  articleIds?: number[];
  /** What versions written before facts could carry several articles used. */
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
  /** Left out to keep whatever the fact already cites; given, it replaces it. */
  articleIds?: number[] | undefined;
};

export type Revision = {
  facts: FactDraft[];
  author: Author;
  reasoning?: string | null | undefined;
};

/**
 * One change to one fact. A revision is a list of these rather than a fresh
 * copy of the set: the analyst says what moved, and everything it does not
 * name is carried across untouched.
 *
 * `set` names a fact that exists and gives only the parts that changed — a
 * line, a confidence, further articles it now rests on — so raising a
 * confidence costs a token, not a retyped sentence. `add` files a new one.
 * `drop` removes one that turned out to be false.
 */
export type FactEdit =
  | {
      op: "set";
      id: string;
      content?: string | undefined;
      confidence?: number | undefined;
      /** Added to what the fact already cites; a citation is never retyped to keep it. */
      articleIds?: number[] | undefined;
    }
  | {
      op: "add";
      content: string;
      confidence?: number | undefined;
      articleIds?: number[] | undefined;
    }
  | { op: "drop"; id: string };

export type Amendment = {
  edits: FactEdit[];
  author: Author;
  reasoning?: string | null | undefined;
};

/**
 * What an amendment did. `version` is null when nothing was written, which
 * happens only when an edit named a fact this dashboard does not have: the
 * whole amendment is refused rather than half-applied, so `unknown` is the
 * one thing to say back to whoever wrote it.
 */
export type AmendResult = {
  version: FactsVersion | null;
  /** The set as it stood before, for reporting what the amendment changed. */
  before: Fact[];
  unknown: string[];
};

/**
 * Writes the set as it now stands, as the next version, from the whole list.
 * What is left out is dropped. This is the reader's path — the pane beside the
 * chat edits the list it is displaying — where the whole set is genuinely in
 * hand; the analyst amends instead.
 */
export async function revise(
  dashboardId: string,
  revision: Revision,
): Promise<FactsVersion> {
  const { version } = await commit(
    dashboardId,
    revision.author,
    revision.reasoning,
    () => revision.facts,
  );
  return version!;
}

/**
 * Writes the next version from a list of changes rather than a list of facts.
 *
 * The current set is read inside the same transaction that writes the new one,
 * so an amendment applies to what stands at the moment it lands rather than to
 * whatever the caller last read. Two runs touching one dashboard both keep
 * their work: with a whole-list rewrite the second silently erased the first.
 *
 * It stays one version in the history either way. The unit of the record is
 * the change the analyst made — several facts moving together for one reason —
 * and that is unchanged by naming the facts instead of retyping them.
 */
export async function amend(
  dashboardId: string,
  amendment: Amendment,
): Promise<AmendResult> {
  return commit(dashboardId, amendment.author, amendment.reasoning, (before) =>
    applyEdits(before, amendment.edits),
  );
}

/**
 * The set an amendment leaves behind: every standing fact, changed where it
 * was named and carried across untouched where it was not, then whatever is
 * new.
 *
 * An edit naming a fact that is not there stops the whole amendment. It means
 * the analyst is working from a list it has misread or misremembered, and the
 * silent alternative — filing the edit as a new fact — writes a duplicate of
 * something it meant to correct.
 */
function applyEdits(
  before: Fact[],
  edits: FactEdit[],
): FactDraft[] | { unknown: string[] } {
  const standing = new Map(before.map((fact) => [fact.id, fact]));

  const unknown = edits
    .filter((edit) => edit.op !== "add" && !standing.has(edit.id))
    .map((edit) => (edit.op === "add" ? "" : edit.id));
  if (unknown.length > 0) return { unknown: [...new Set(unknown)] };

  const dropped = new Set(
    edits.flatMap((edit) => (edit.op === "drop" ? [edit.id] : [])),
  );
  // two edits to one fact in a call are one intention written twice; the
  // later one is what the analyst settled on
  const changes = new Map<string, Extract<FactEdit, { op: "set" }>>();
  for (const edit of edits) {
    if (edit.op === "set") changes.set(edit.id, edit);
  }

  const kept: FactDraft[] = before
    .filter((fact) => !dropped.has(fact.id))
    .map((fact) => {
      const edit = changes.get(fact.id);
      if (!edit) {
        return {
          id: fact.id,
          content: fact.content,
          confidence: fact.confidence,
          articleIds: fact.articleIds,
        };
      }
      return {
        id: fact.id,
        content: edit.content?.trim() || fact.content,
        confidence: edit.confidence ?? fact.confidence,
        // named citations are added to what it already rests on: an edit
        // about the wording of a line must not strip the article behind it
        articleIds: [...fact.articleIds, ...(edit.articleIds ?? [])],
      };
    });

  const added: FactDraft[] = edits.flatMap((edit) =>
    edit.op === "add"
      ? [
          {
            content: edit.content,
            confidence: edit.confidence,
            articleIds: edit.articleIds,
          },
        ]
      : [],
  );

  return [...kept, ...added];
}

/**
 * The transaction both paths share: lock the arc, read what stands, let the
 * caller say what the set should now be, and write it as the next version.
 *
 * Drafts carrying an id keep it, so the fact stays the same fact across the
 * revision; the ones without get a fresh one, counted past every id this
 * dashboard has ever handed out rather than past the current set — a number
 * that once meant one fact should never come back meaning another.
 *
 * A kept fact keeps the date it was first written down too. Only what is
 * genuinely new is stamped now, which is what lets the list be read newest
 * first without a rewrite of the set shuffling everything to the top.
 *
 * Its citations carry across the same way when the draft says nothing about
 * them. A revision that is only about the wording of a line should not quietly
 * strip what the line rests on; dropping a citation is done by passing the
 * ones that remain.
 */
async function commit(
  dashboardId: string,
  author: Author,
  reasoning: string | null | undefined,
  build: (before: Fact[]) => FactDraft[] | { unknown: string[] },
): Promise<AmendResult> {
  return withTransaction(async (client) => {
    // serializes concurrent revisions of the same arc: the second waits, then
    // numbers itself off the first rather than colliding with it
    await client.query("select 1 from dashboards where id = $1 for update", [
      dashboardId,
    ]);

    // what each surviving fact was first written down and rests on, by id
    const { rows: previous } = await client.query<{
      facts: StoredFact[] | null;
      created_at: Date;
    }>(
      `select facts, created_at from fact_versions
        where dashboard_id = $1
        order by version desc
        limit 1`,
      [dashboardId],
    );
    const before = normalize(
      previous[0]?.facts ?? [],
      previous[0]?.created_at?.toISOString() ?? new Date().toISOString(),
    );
    const born = new Map(before.map((fact) => [fact.id, fact.createdAt]));
    const cited = new Map(before.map((fact) => [fact.id, fact.articleIds]));

    const built = build(before);
    if ("unknown" in built) {
      return { version: null, before, unknown: built.unknown };
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
    for (const draft of built) {
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
        articleIds: citations(draft.articleIds ?? cited.get(id) ?? []),
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
        author,
        reasoning?.trim() || null,
      ],
    );
    return {
      version: (await hydrate(rows))[0]!,
      before,
      unknown: [],
    };
  });
}

/** Stored facts as facts, whichever shape the version was written in. */
function normalize(rows: StoredFact[], versionDate: string): Fact[] {
  return rows.flatMap((fact) =>
    fact.id
      ? [
          {
            id: fact.id,
            content: fact.content ?? "",
            confidence: clamp(fact.confidence ?? DEFAULT_CONFIDENCE),
            articleIds: stored(fact),
            // a fact written before facts were dated is as old as its version
            createdAt: fact.createdAt ?? versionDate,
          },
        ]
      : [],
  );
}

/**
 * The citations on a stored fact, whichever shape it was written in: rows
 * written before a fact could rest on several articles carry one `articleId`
 * instead of the array, and they are never rewritten in place.
 */
function stored(fact: StoredFact): number[] {
  if (Array.isArray(fact.articleIds)) return citations(fact.articleIds);
  return typeof fact.articleId === "number" ? [fact.articleId] : [];
}

/**
 * Citations as they are kept: whole numbers, in the order they were first
 * cited, each of them once. The same article read twice under two stories is
 * one citation, not two.
 */
function citations(ids: readonly unknown[]): number[] {
  const seen = new Set<number>();
  for (const id of ids) {
    const value = Number(id);
    if (Number.isSafeInteger(value) && value > 0) seen.add(value);
  }
  return [...seen];
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
 * An article that has since been deleted drops out of `sources` while the fact
 * keeps its number — losing the citation must lose neither the fact nor the
 * rest of what it rests on.
 */
async function hydrate(rows: Row[]): Promise<FactsVersion[]> {
  const ids = new Set<number>();
  for (const row of rows) {
    for (const fact of row.facts ?? []) {
      for (const id of stored(fact)) ids.add(id);
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
      const articleIds = stored(fact);
      return {
        id: fact.id ?? "",
        content: fact.content ?? "",
        confidence: clamp(fact.confidence ?? DEFAULT_CONFIDENCE),
        articleIds,
        // a fact written before facts were dated is as old as its version
        createdAt: fact.createdAt ?? row.created_at.toISOString(),
        sources: articleIds.flatMap((id) => {
          const source = sources.get(id);
          return source ? [{ id, ...source }] : [];
        }),
      };
    }),
  }));
}

/** "f12" sorts after "f2" — the label is a number wearing a letter. */
function order(id: string): number {
  const n = Number(id.replace(/^f/, ""));
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}
