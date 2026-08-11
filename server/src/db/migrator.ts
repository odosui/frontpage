import fs from "fs/promises";
import path from "path";
import { PoolClient } from "pg";
import { getPool } from "./pool";

/**
 * Migrations live next to the compiled output, so this resolves the same from
 * `src/db` (ts-node) and `dist/db` (production).
 */
export const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "migrations");

/** Guards against two processes migrating at once (e.g. replicas booting). */
const LOCK_KEY = 4213770127;

const FILE_RE = /^(\d+)_(.+)\.sql$/;
const MARKER_RE = /^\s*--\s*\+migrate\s+(up|down)\s*$/i;

export type Migration = {
  version: string;
  name: string;
  file: string;
  up: string;
  down: string;
};

export type MigrationStatus = {
  version: string;
  name: string;
  appliedAt: Date | null;
};

export async function loadMigrations(): Promise<Migration[]> {
  const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) =>
    FILE_RE.test(f),
  );
  files.sort();

  const migrations: Migration[] = [];
  for (const file of files) {
    const match = FILE_RE.exec(file)!;
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf-8");
    const { up, down } = parseSections(sql);
    if (!up) {
      throw new Error(`migration ${file} has no "-- +migrate up" section`);
    }
    migrations.push({
      version: match[1]!,
      name: match[2]!,
      file,
      up,
      down,
    });
  }

  const seen = new Set<string>();
  for (const m of migrations) {
    if (seen.has(m.version)) {
      throw new Error(`duplicate migration version: ${m.version}`);
    }
    seen.add(m.version);
  }

  return migrations;
}

function parseSections(sql: string): { up: string; down: string } {
  const sections: Record<"up" | "down", string[]> = { up: [], down: [] };
  let current: "up" | "down" | null = null;

  for (const line of sql.split(/\r?\n/)) {
    const marker = MARKER_RE.exec(line);
    if (marker) {
      current = marker[1]!.toLowerCase() as "up" | "down";
      continue;
    }
    if (current) sections[current].push(line);
  }

  return {
    up: sections.up.join("\n").trim(),
    down: sections.down.join("\n").trim(),
  };
}

async function ensureMigrationsTable(client: PoolClient) {
  await client.query(`
    create table if not exists schema_migrations (
      version    text primary key,
      name       text not null,
      applied_at timestamptz not null default now()
    )
  `);
}

async function appliedVersions(client: PoolClient): Promise<Set<string>> {
  const { rows } = await client.query<{ version: string }>(
    "select version from schema_migrations",
  );
  return new Set(rows.map((r) => r.version));
}

/** Run fn with the migration advisory lock held. */
async function withMigrationLock<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);
    await ensureMigrationsTable(client);
    return await fn(client);
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]).catch(
      () => undefined,
    );
    client.release();
  }
}

/** Apply every pending migration. Returns the versions that ran. */
export function migrateUp(): Promise<string[]> {
  return withMigrationLock(async (client) => {
    const applied = await appliedVersions(client);
    const pending = (await loadMigrations()).filter(
      (m) => !applied.has(m.version),
    );

    const ran: string[] = [];
    for (const m of pending) {
      console.log(`[migrate] up ${m.version}_${m.name}`);
      await runInTransaction(client, m.up, async () => {
        await client.query(
          "insert into schema_migrations (version, name) values ($1, $2)",
          [m.version, m.name],
        );
      });
      ran.push(m.version);
    }

    if (ran.length === 0) console.log("[migrate] nothing to apply");
    return ran;
  });
}

/** Roll back the last `steps` applied migrations. Returns the versions undone. */
export function migrateDown(steps = 1): Promise<string[]> {
  return withMigrationLock(async (client) => {
    const { rows } = await client.query<{ version: string }>(
      "select version from schema_migrations order by version desc limit $1",
      [steps],
    );

    const byVersion = new Map(
      (await loadMigrations()).map((m) => [m.version, m]),
    );

    const undone: string[] = [];
    for (const { version } of rows) {
      const m = byVersion.get(version);
      if (!m) {
        throw new Error(
          `cannot roll back ${version}: migration file is missing`,
        );
      }
      if (!m.down) {
        throw new Error(
          `cannot roll back ${m.file}: no "-- +migrate down" section`,
        );
      }
      console.log(`[migrate] down ${m.version}_${m.name}`);
      await runInTransaction(client, m.down, async () => {
        await client.query("delete from schema_migrations where version = $1", [
          m.version,
        ]);
      });
      undone.push(version);
    }

    if (undone.length === 0) console.log("[migrate] nothing to roll back");
    return undone;
  });
}

export function migrationStatus(): Promise<MigrationStatus[]> {
  return withMigrationLock(async (client) => {
    const { rows } = await client.query<{ version: string; applied_at: Date }>(
      "select version, applied_at from schema_migrations",
    );
    const appliedAt = new Map(rows.map((r) => [r.version, r.applied_at]));

    return (await loadMigrations()).map((m) => ({
      version: m.version,
      name: m.name,
      appliedAt: appliedAt.get(m.version) ?? null,
    }));
  });
}

async function runInTransaction(
  client: PoolClient,
  sql: string,
  after: () => Promise<void>,
) {
  await client.query("begin");
  try {
    await client.query(sql);
    await after();
    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  }
}
