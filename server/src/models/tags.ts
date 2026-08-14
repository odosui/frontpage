import { query } from "../db/pool";

export type Tag = {
  id: number;
  dashboardId: string;
  name: string;
  slug: string;
  /** How many articles carry it — the signal for whether a tag is established. */
  articleCount: number;
};

type Row = {
  id: string;
  dashboard_id: string;
  name: string;
  slug: string;
  article_count: string;
};

const SELECT = `select t.id, t.dashboard_id, t.name, t.slug,
                       count(at.article_id) as article_count
                from tags t
                left join article_tags at on at.tag_id = t.id`;

function toTag(row: Row): Tag {
  return {
    id: Number(row.id),
    dashboardId: row.dashboard_id,
    name: row.name,
    slug: row.slug,
    articleCount: Number(row.article_count),
  };
}

/**
 * Most-used tags first. An agent picking tags should see the established
 * vocabulary before it invents a near-duplicate of one.
 */
export async function popular(limit: number): Promise<Tag[]> {
  const { rows } = await query<Row>(
    `${SELECT}
     group by t.id
     order by article_count desc, t.name
     limit $1`,
    [limit],
  );
  return rows.map(toTag);
}

/** Case-insensitive substring match on the tag name. */
export async function search(term: string, limit: number): Promise<Tag[]> {
  const { rows } = await query<Row>(
    `${SELECT}
     where t.name ilike '%' || $1 || '%'
     group by t.id
     order by article_count desc, t.name
     limit $2`,
    [term, limit],
  );
  return rows.map(toTag);
}
