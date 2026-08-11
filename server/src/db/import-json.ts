/**
 * One-shot import of the pre-postgres storage: the `*.json` dashboard files
 * under FRONTPAGE_HOME (default ~/.frontpage). Safe to re-run — dashboards
 * that already hold widgets are skipped unless --overwrite is passed.
 */
import fs from "fs/promises";
import os from "os";
import path from "path";
import { LayoutItem } from "../api/types";
import * as dbs from "../api/dashboards";
import { describeDatabase } from "./config";
import { migrateUp } from "./migrator";
import { closePool } from "./pool";

const CONFIG_DIR =
  process.env.FRONTPAGE_HOME || path.join(os.homedir(), ".frontpage");

async function main() {
  const overwrite = process.argv.includes("--overwrite");

  console.log(`[import] from ${CONFIG_DIR} into ${describeDatabase()}`);
  await migrateUp();

  let files: string[];
  try {
    files = (await fs.readdir(CONFIG_DIR)).filter((f) => f.endsWith(".json"));
  } catch {
    console.log(`[import] ${CONFIG_DIR} does not exist — nothing to import`);
    return;
  }

  for (const file of files) {
    const id = dbs.slugify(file.replace(/\.json$/, ""));
    if (!id) {
      console.log(`[import] skipping ${file}: not a valid dashboard id`);
      continue;
    }

    const layout = await readLayout(path.join(CONFIG_DIR, file));
    if (!layout) {
      console.log(`[import] skipping ${file}: unreadable`);
      continue;
    }

    const already = await dbs.exists(id);
    // an existing-but-empty dashboard (e.g. the seeded `default`) is still a
    // valid import target — only real content is protected
    if (already && !overwrite && (await dbs.getLayout(id, 0)).length > 0) {
      console.log(`[import] skipping ${id}: already has widgets`);
      continue;
    }
    if (!already) await dbs.create(id, id);

    await dbs.saveLayout(
      id,
      layout.map(({ items: _items, ...rest }) => rest),
    );
    let articles = 0;
    for (const widget of layout) {
      await dbs.replaceArticles(id, widget.i, widget.items || []);
      articles += (widget.items || []).length;
    }

    console.log(
      `[import] ${id}: ${layout.length} widgets, ${articles} articles`,
    );
  }
}

async function readLayout(file: string): Promise<LayoutItem[] | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf-8"));
    return Array.isArray(parsed?.layout) ? parsed.layout : null;
  } catch {
    return null;
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closePool);
