import { PoolConfig } from "pg";

type SslConfig = { rejectUnauthorized: boolean };

/**
 * Connection settings, in order of precedence:
 *   1. FRONTPAGE_DATABASE_URL / DATABASE_URL
 *   2. discrete PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE vars
 */
export function databaseConfig(): PoolConfig {
  const ssl = sslConfig();
  const url = process.env.FRONTPAGE_DATABASE_URL || process.env.DATABASE_URL;

  const base: PoolConfig = url
    ? { connectionString: url }
    : {
        host: process.env.PGHOST || "localhost",
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || "postgres",
        password: process.env.PGPASSWORD || "postgres",
        database: process.env.PGDATABASE || "frontpage",
      };

  return {
    ...base,
    ...(ssl ? { ssl } : {}),
    max: Number(process.env.FRONTPAGE_DB_POOL_MAX || 10),
  };
}

/**
 * FRONTPAGE_DATABASE_SSL: "true"/"require" verifies the server certificate,
 * "no-verify" accepts self-signed ones. Anything else (or unset) means no SSL.
 */
function sslConfig(): SslConfig | undefined {
  const mode = (process.env.FRONTPAGE_DATABASE_SSL || "").toLowerCase();
  if (mode === "true" || mode === "require") return { rejectUnauthorized: true };
  if (mode === "no-verify") return { rejectUnauthorized: false };
  return undefined;
}

/** Human-readable target for logs, with the password stripped out. */
export function describeDatabase(): string {
  const url = process.env.FRONTPAGE_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    const cfg = databaseConfig();
    return `${cfg.host}:${cfg.port}/${cfg.database}`;
  }
  try {
    const parsed = new URL(url);
    parsed.password = "";
    return parsed.toString();
  } catch {
    return "(invalid database url)";
  }
}
