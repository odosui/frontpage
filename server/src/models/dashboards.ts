import { query } from "../db/pool";
import { slugify } from "../utils/slug";

/**
 * A dashboard is the running arc — what used to be a storyline. It owns the
 * stories filed under it, the facts they establish, the predictions they point
 * to, and the conversations about them. The sources it reads are assigned to
 * it rather than owned by it; see `models/sources`.
 */
export type Dashboard = {
  /** The slug, and how it is addressed in a url. */
  id: string;
  /** What the reader called it, with its spaces and punctuation intact. */
  name: string;
  /**
   * The arc's own standing instruction to the agents, appended to the system
   * message of every run and chat turn on it. Empty when none has been set.
   */
  prompt: string;
  storyCount: number;
  sourceCount: number;
  createdAt: string;
};

type Row = {
  id: string;
  name: string;
  prompt: string;
  story_count: string;
  source_count: string;
  created_at: Date;
};

const SELECT = `select d.id, d.name, d.prompt, d.created_at,
                       (select count(*) from stories s where s.dashboard_id = d.id)
                         as story_count,
                       (select count(*) from dashboard_sources ds
                         where ds.dashboard_id = d.id) as source_count
                  from dashboards d`;

function toDashboard(row: Row): Dashboard {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    storyCount: Number(row.story_count),
    sourceCount: Number(row.source_count),
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * The url-safe id behind a name. Dashboards are arcs now, so the names carry
 * spaces and punctuation — "Russian-Ukrainian war" is addressed as
 * `russian-ukrainian-war` rather than stripped down to one run-on word.
 */
export function idFor(name: string): string {
  return slugify(name);
}

/**
 * In the order they were made. There is no dashboard that comes first by
 * right any more — nothing is created for the reader, and the arcs on the page
 * are the arcs they asked for.
 */
export async function listAll(): Promise<Dashboard[]> {
  const { rows } = await query<Row>(`${SELECT} order by d.created_at, d.id`);
  return rows.map(toDashboard);
}

export async function get(id: string): Promise<Dashboard | null> {
  const { rows } = await query<Row>(`${SELECT} where d.id = $1`, [id]);
  return rows[0] ? toDashboard(rows[0]) : null;
}

export async function exists(id: string): Promise<boolean> {
  const { rowCount } = await query("select 1 from dashboards where id = $1", [
    id,
  ]);
  return rowCount === 1;
}

export async function create(id: string, name: string): Promise<Dashboard> {
  await query("insert into dashboards (id, name) values ($1, $2)", [id, name]);
  return (await get(id))!;
}

export async function remove(id: string) {
  await query("delete from dashboards where id = $1", [id]);
}

/**
 * The arc's standing instruction to its agents. Stored trimmed, and stored
 * empty rather than null when it is cleared, so every read is a plain string.
 */
export async function setPrompt(
  id: string,
  prompt: string,
): Promise<Dashboard | null> {
  const { rowCount } = await query(
    "update dashboards set prompt = $2 where id = $1",
    [id, prompt.trim()],
  );
  return rowCount === 1 ? get(id) : null;
}

/**
 * Only the display name moves. The id is the url the reader may have kept and
 * the key every story, fact and prediction hangs off, so renaming an arc from
 * "Iran talks" to "Iran nuclear talks" leaves all of that where it is.
 */
export async function rename(id: string, name: string): Promise<Dashboard | null> {
  const { rowCount } = await query(
    "update dashboards set name = $2 where id = $1",
    [id, name],
  );
  return rowCount === 1 ? get(id) : null;
}
