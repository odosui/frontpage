import { query } from "../db/pool";
import { slugify } from "../utils/slug";

export type Storyline = {
  id: number;
  dashboardId: string | null;
  title: string;
  slug: string;
  /** How many stories currently hang off it. */
  storyCount: number;
  createdAt: string;
};

type Row = {
  id: string;
  dashboard_id: string;
  title: string;
  slug: string;
  story_count: string;
  created_at: Date;
};

const SELECT = `select s.id, s.dashboard_id, s.title, s.slug, s.created_at,
                       count(st.id) as story_count
                from storylines s
                left join stories st on st.storyline_id = s.id`;

function toStoryline(row: Row): Storyline {
  return {
    id: Number(row.id),
    dashboardId: row.dashboard_id,
    title: row.title,
    slug: row.slug,
    storyCount: Number(row.story_count),
    createdAt: row.created_at.toISOString(),
  };
}

/** Newest storylines first — what an agent needs to avoid inventing a duplicate. */
export async function latest(
  dashboardId: string,
  limit: number,
): Promise<Storyline[]> {
  const { rows } = await query<Row>(
    `${SELECT}
     where s.dashboard_id = $1
     group by s.id
     order by s.created_at desc, s.id desc
     limit $2`,
    [dashboardId, limit],
  );
  return rows.map(toStoryline);
}

/**
 * Every arc in the dashboard, for a menu that has to offer all of them —
 * including the ones nothing is filed under yet.
 */
export async function all(dashboardId: string): Promise<Storyline[]> {
  const { rows } = await query<Row>(
    `${SELECT}
     where s.dashboard_id = $1
     group by s.id
     order by s.title`,
    [dashboardId],
  );
  return rows.map(toStoryline);
}

/**
 * The arc under this title, made if it is not there yet. Matched by slug, so
 * "US election" lands on the existing "U.S. Elections" rather than starting a
 * second one beside it.
 */
export async function ensure(
  dashboardId: string,
  title: string,
): Promise<Storyline> {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("a storyline needs a title");

  const { rows } = await query<{ id: string }>(
    `insert into storylines (dashboard_id, title, slug)
     values ($1, $2, $3)
     on conflict (dashboard_id, slug) do update set title = storylines.title
     returning id`,
    [dashboardId, trimmed, slugify(trimmed)],
  );

  const { rows: found } = await query<Row>(
    `${SELECT} where s.id = $1 group by s.id`,
    [rows[0]!.id],
  );
  return toStoryline(found[0]!);
}

/** Case-insensitive substring match on the title. */
export async function search(
  dashboardId: string,
  term: string,
  limit: number,
): Promise<Storyline[]> {
  const { rows } = await query<Row>(
    `${SELECT}
     where s.dashboard_id = $1 and s.title ilike '%' || $2 || '%'
     group by s.id
     order by s.created_at desc, s.id desc
     limit $3`,
    [dashboardId, term, limit],
  );
  return rows.map(toStoryline);
}
