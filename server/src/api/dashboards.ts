import { query, withTransaction } from "../db/pool";
import { Article, LayoutItem } from "./types";

const DEFAULT_DASHBOARD = "default";

export function resolveId(id: string): string {
  return id || DEFAULT_DASHBOARD;
}

export function isDefault(id: string): boolean {
  return id === DEFAULT_DASHBOARD;
}

/** Dashboard ids double as their display name, so keep them url-safe. */
export function slugify(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "");
}

export async function ensureDefaultDashboard() {
  await query(
    `insert into dashboards (id, name) values ($1, $1)
     on conflict (id) do nothing`,
    [DEFAULT_DASHBOARD],
  );
}

export async function listAll(): Promise<string[]> {
  await ensureDefaultDashboard();
  const { rows } = await query<{ id: string }>(
    `select id from dashboards
     order by (id = $1) desc, created_at, id`,
    [DEFAULT_DASHBOARD],
  );
  return rows.map((r) => r.id);
}

export async function exists(id: string): Promise<boolean> {
  const { rowCount } = await query("select 1 from dashboards where id = $1", [
    id,
  ]);
  return rowCount === 1;
}

export async function create(id: string, name: string) {
  await query("insert into dashboards (id, name) values ($1, $2)", [id, name]);
}

export async function remove(id: string) {
  await query("delete from dashboards where id = $1", [id]);
}

/** Widgets and articles follow via `on update cascade`. */
export async function rename(oldId: string, newId: string) {
  await query("update dashboards set id = $1, name = $2 where id = $3", [
    newId,
    newId,
    oldId,
  ]);
}

/** Full layout with each widget's articles, capped at `limit` per widget. */
export async function getLayout(
  id: string,
  limit: number,
): Promise<LayoutItem[]> {
  const { rows } = await query<LayoutItem>(
    `select w.id as i, w.x, w.y, w.w, w.h, w.url,
            coalesce(a.items, '[]'::json) as items
     from widgets w
     left join lateral (
       select json_agg(
                json_build_object(
                  'title', t.title, 'url', t.url,
                  'image', t.image, 'new', t.is_new
                ) order by t.position
              ) as items
       from (
         select title, url, image, is_new, position
         from articles
         where dashboard_id = w.dashboard_id and widget_id = w.id
         order by position
         limit $2
       ) t
     ) a on true
     where w.dashboard_id = $1
     order by w.position, w.id`,
    [id, limit],
  );
  return rows;
}

export async function getWidget(
  dashboardId: string,
  widgetId: string,
): Promise<LayoutItem | null> {
  const { rows } = await query<LayoutItem>(
    `select id as i, x, y, w, h, url
     from widgets where dashboard_id = $1 and id = $2`,
    [dashboardId, widgetId],
  );
  return rows[0] ?? null;
}

export async function getArticles(
  dashboardId: string,
  widgetId: string,
  limit: number,
): Promise<Article[]> {
  const { rows } = await query<Article>(
    `select title, url, image, is_new as new
     from articles
     where dashboard_id = $1 and widget_id = $2
     order by position
     limit $3`,
    [dashboardId, widgetId, limit],
  );
  return rows;
}

/**
 * Replace positions/sizes for the dashboard. Widgets absent from `layout` are
 * dropped (taking their articles with them); articles of the rest are kept.
 */
export function saveLayout(id: string, layout: Omit<LayoutItem, "items">[]) {
  return withTransaction(async (client) => {
    const ids = layout.map((item) => item.i);

    await client.query(
      `delete from widgets
       where dashboard_id = $1 and not (id = any($2::text[]))`,
      [id, ids],
    );

    for (const [position, item] of layout.entries()) {
      await client.query(
        `insert into widgets (dashboard_id, id, position, x, y, w, h, url)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (dashboard_id, id) do update
           set position = excluded.position,
               x = excluded.x, y = excluded.y,
               w = excluded.w, h = excluded.h,
               url = excluded.url`,
        [id, item.i, position, item.x, item.y, item.w, item.h, item.url],
      );
    }
  });
}

export async function addWidget(id: string, widget: LayoutItem) {
  await query(
    `insert into widgets (dashboard_id, id, position, x, y, w, h, url)
     values (
       $1, $2,
       coalesce((select max(position) + 1 from widgets where dashboard_id = $1), 0),
       $3, $4, $5, $6, $7
     )
     on conflict (dashboard_id, id) do update
       set x = excluded.x, y = excluded.y,
           w = excluded.w, h = excluded.h,
           url = excluded.url`,
    [id, widget.i, widget.x, widget.y, widget.w, widget.h, widget.url],
  );
}

export async function deleteWidget(
  dashboardId: string,
  widgetId: string,
): Promise<boolean> {
  const { rowCount } = await query(
    "delete from widgets where dashboard_id = $1 and id = $2",
    [dashboardId, widgetId],
  );
  return rowCount === 1;
}

/**
 * Put `items` at the top of a widget's list, marked as new, demoting whatever
 * was already there. Items whose url is already stored are skipped. Runs under
 * a row lock so concurrent refreshes can't interleave. Returns the resulting
 * list, capped at `limit`.
 */
export function prependArticles(
  dashboardId: string,
  widgetId: string,
  items: Article[],
  limit: number,
): Promise<Article[]> {
  return withTransaction(async (client) => {
    await client.query(
      "select 1 from widgets where dashboard_id = $1 and id = $2 for update",
      [dashboardId, widgetId],
    );

    await client.query(
      `update articles set is_new = false, position = position + $3
       where dashboard_id = $1 and widget_id = $2`,
      [dashboardId, widgetId, items.length],
    );

    if (items.length > 0) {
      await client.query(
        `insert into articles
           (dashboard_id, widget_id, position, title, url, image, is_new)
         select $1, $2, t.i - 1, t.title, t.url, t.image, true
         from unnest($3::text[], $4::text[], $5::text[])
           with ordinality as t(title, url, image, i)
         where not exists (
           select 1 from articles existing
           where existing.dashboard_id = $1
             and existing.widget_id = $2
             and existing.url = t.url
         )`,
        [
          dashboardId,
          widgetId,
          items.map((a) => a.title),
          items.map((a) => a.url),
          items.map((a) => a.image),
        ],
      );
    }

    const { rows } = await client.query<Article>(
      `select title, url, image, is_new as new
       from articles
       where dashboard_id = $1 and widget_id = $2
       order by position
       limit $3`,
      [dashboardId, widgetId, limit],
    );
    return rows;
  });
}

/** Swap a widget's article list wholesale, preserving the given order. */
export function replaceArticles(
  dashboardId: string,
  widgetId: string,
  items: Article[],
) {
  return withTransaction(async (client) => {
    await client.query(
      "delete from articles where dashboard_id = $1 and widget_id = $2",
      [dashboardId, widgetId],
    );

    if (items.length === 0) return;

    await client.query(
      `insert into articles
         (dashboard_id, widget_id, position, title, url, image, is_new)
       select $1, $2, t.i - 1, t.title, t.url, t.image, t.is_new
       from unnest($3::text[], $4::text[], $5::text[], $6::boolean[])
         with ordinality as t(title, url, image, is_new, i)`,
      [
        dashboardId,
        widgetId,
        items.map((a) => a.title),
        items.map((a) => a.url),
        items.map((a) => a.image),
        items.map((a) => a.new ?? false),
      ],
    );
  });
}
