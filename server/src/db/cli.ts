import fs from "fs/promises";
import path from "path";
import { describeDatabase } from "./config";
import {
  MIGRATIONS_DIR,
  migrateDown,
  migrateUp,
  migrationStatus,
} from "./migrator";
import { closePool } from "./pool";

const USAGE = `usage: migrate <command>

commands:
  up                 apply all pending migrations
  down [steps]       roll back the last N migrations (default 1)
  status             list migrations and whether they are applied
  new <name>         create a new empty migration file
`;

async function main() {
  const [command = "", ...args] = process.argv.slice(2);

  switch (command) {
    case "up":
      console.log(`[migrate] ${describeDatabase()}`);
      await migrateUp();
      break;

    case "down": {
      const steps = args[0] ? Number(args[0]) : 1;
      if (!Number.isInteger(steps) || steps < 1) {
        throw new Error(`invalid step count: ${args[0]}`);
      }
      console.log(`[migrate] ${describeDatabase()}`);
      await migrateDown(steps);
      break;
    }

    case "status": {
      const rows = await migrationStatus();
      console.log(`[migrate] ${describeDatabase()}`);
      for (const r of rows) {
        const mark = r.appliedAt ? r.appliedAt.toISOString() : "pending";
        console.log(`  ${r.version}_${r.name}  ${mark}`);
      }
      break;
    }

    case "new":
      await createMigration(args.join(" "));
      break;

    default:
      console.log(USAGE);
      process.exitCode = command ? 1 : 0;
  }
}

async function createMigration(rawName: string) {
  const name = rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!name) throw new Error("a migration name is required");

  const existing = (await fs.readdir(MIGRATIONS_DIR))
    .map((f) => /^(\d+)_/.exec(f)?.[1])
    .filter((v): v is string => !!v)
    .map(Number);
  const next = String(Math.max(0, ...existing) + 1).padStart(3, "0");

  const file = path.join(MIGRATIONS_DIR, `${next}_${name}.sql`);
  await fs.writeFile(
    file,
    `-- +migrate up\n\n\n-- +migrate down\n\n`,
    "utf-8",
  );
  console.log(`created ${path.relative(process.cwd(), file)}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closePool);
