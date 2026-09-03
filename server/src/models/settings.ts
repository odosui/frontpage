import { query } from "../db/pool";

type Row = { key: string; value: string };

/**
 * The api and the worker are separate processes, so a setting changed in one
 * has to reach the other. It does so by expiring: every read is served from
 * this cache for a few seconds and then goes back to the table.
 *
 * A model swap taking a few seconds to reach a running worker is fine; a
 * database round trip in front of every model call is not.
 */
const TTL_MS = 5_000;

let cache: Map<string, string> | undefined;
let cachedAt = 0;

async function load(): Promise<Map<string, string>> {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  const { rows } = await query<Row>("select key, value from settings");
  cache = new Map(rows.map((r) => [r.key, r.value]));
  cachedAt = Date.now();
  return cache;
}

/** The stored value, or null when the key has never been set. */
export async function get(key: string): Promise<string | null> {
  return (await load()).get(key) ?? null;
}

export async function all(): Promise<Record<string, string>> {
  return Object.fromEntries(await load());
}

export async function set(key: string, value: string): Promise<void> {
  await query(
    `insert into settings (key, value) values ($1, $2)
       on conflict (key) do update
       set value = excluded.value, updated_at = now()`,
    [key, value],
  );
  invalidate();
}

/** Back to the built-in default: the row goes away rather than storing one. */
export async function unset(key: string): Promise<void> {
  await query("delete from settings where key = $1", [key]);
  invalidate();
}

/** So a write in this process is visible to it immediately, not in TTL_MS. */
function invalidate() {
  cache = undefined;
  cachedAt = 0;
}
