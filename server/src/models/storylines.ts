import { query } from "../db/pool";

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
export async function latest(limit: number): Promise<Storyline[]> {
  const { rows } = await query<Row>(
    `${SELECT}
     group by s.id
     order by s.created_at desc, s.id desc
     limit $1`,
    [limit],
  );
  return rows.map(toStoryline);
}

/** Case-insensitive substring match on the title. */
export async function search(
  term: string,
  limit: number,
): Promise<Storyline[]> {
  const { rows } = await query<Row>(
    `${SELECT}
     where s.title ilike '%' || $1 || '%'
     group by s.id
     order by s.created_at desc, s.id desc
     limit $2`,
    [term, limit],
  );
  return rows.map(toStoryline);
}
