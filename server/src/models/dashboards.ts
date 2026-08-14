import { query } from "../db/pool";

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

/** Channels and articles follow via `on update cascade`. */
export async function rename(oldId: string, newId: string) {
  await query("update dashboards set id = $1, name = $2 where id = $3", [
    newId,
    newId,
    oldId,
  ]);
}
