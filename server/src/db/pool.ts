import { Pool, PoolClient, QueryResultRow } from "pg";
import { databaseConfig } from "./config";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(databaseConfig());
    // an idle client erroring out (server restart, network blip) must not
    // take the process down
    pool.on("error", (err) => console.error("[db] idle client error:", err));
  }
  return pool;
}

export function query<T extends QueryResultRow>(text: string, params?: unknown[]) {
  return getPool().query<T>(text, params);
}

/** Run fn inside a transaction, rolling back if it throws. */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) {
    const p = pool;
    pool = undefined;
    await p.end();
  }
}
