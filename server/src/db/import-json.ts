/**
 * One-shot import of the pre-postgres storage: the `*.json` dashboard files
 * under FRONTPAGE_HOME (default ~/.frontpage). Safe to re-run — dashboards
 * that already hold channels are skipped unless --overwrite is passed.
 */
import fs from "fs/promises";
import os from "os";
import path from "path";
import { Article } from "../api/types";
import * as articles from "../models/articles";
import * as channels from "../models/channels";
import * as dashboards from "../models/dashboards";
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
    const id = dashboards.slugify(file.replace(/\.json$/, ""));
    if (!id) {
      console.log(`[import] skipping ${file}: not a valid dashboard id`);
      continue;
    }

    const layout = await readLayout(path.join(CONFIG_DIR, file));
    if (!layout) {
      console.log(`[import] skipping ${file}: unreadable`);
      continue;
    }

    const already = await dashboards.exists(id);
    // an existing-but-empty dashboard (e.g. the seeded `default`) is still a
    // valid import target — only real content is protected
    if (already && !overwrite && (await channels.list(id)).length > 0) {
      console.log(`[import] skipping ${id}: already has channels`);
      continue;
    }
    if (!already) await dashboards.create(id, id);

    let articleCount = 0;
    // the old files carried grid coordinates too; only the name and url survive
    for (const item of layout) {
      await channels.add(id, { id: item.i, kind: "web", url: item.url });
      await articles.replace(id, item.i, item.items || []);
      articleCount += (item.items || []).length;
    }

    console.log(
      `[import] ${id}: ${layout.length} channels, ${articleCount} articles`,
    );
  }
}

/** The shape the pre-postgres json files used. */
type LegacyLayoutItem = { i: string; url: string; items?: Article[] };

async function readLayout(file: string): Promise<LegacyLayoutItem[] | null> {
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
