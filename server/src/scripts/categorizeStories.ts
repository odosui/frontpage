import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import {
  CategorizeRun,
  RecentArticle,
  categorize,
  recentArticles,
} from "../components/stories/categorize";
import { BIG_MODEL } from "../components/ai/models";
import { closePool } from "../db/pool";

/**
 * Groups the newest articles into category → bigger story → story with one or
 * more models and writes the results out for comparison.
 *
 *   npm run stories -- --limit 20 --model google/gemini-3.1-flash-lite \
 *                      --model google/gemini-3.1-pro-preview
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const models = args.models.length > 0 ? args.models : [BIG_MODEL];

  const articles = await recentArticles(args.limit);
  if (articles.length === 0) {
    throw new Error("no articles in the database — refresh a channel first");
  }
  console.log(`${articles.length} articles, ${models.length} model(s)\n`);

  mkdirSync(args.out, { recursive: true });

  for (const model of models) {
    process.stdout.write(`${model} … `);
    try {
      const run = await categorize(model, articles);
      const stats = summarize(run);
      console.log(
        `${(run.elapsedMs / 1000).toFixed(1)}s · ${stats.categories} categories · ` +
          `${stats.biggerStories} arcs · ${stats.stories} stories · ` +
          `${stats.covered}/${articles.length} articles`,
      );

      const base = join(args.out, model.replace(/[\/:]/g, "_"));
      writeFileSync(
        `${base}.json`,
        JSON.stringify({ ...run, stats }, null, 2) + "\n",
      );
      writeFileSync(`${base}.md`, render(run, stats));
      console.log(`  → ${base}.md`);
    } catch (e) {
      console.log(`failed: ${(e as Error).message}`);
    }
  }
}

export type RunStats = {
  categories: number;
  biggerStories: number;
  stories: number;
  /** Articles placed in some story — the rest were dropped or unassigned. */
  covered: number;
  merged: number;
  duplicated: number[];
  missing: number[];
  unassigned: number;
};

/** The numbers worth comparing between models. */
function summarize(run: CategorizeRun): RunStats {
  const seen = new Map<number, number>();
  let stories = 0;
  let biggerStories = 0;
  let merged = 0;

  for (const category of run.tree.categories) {
    for (const bigger of category.bigger_stories ?? []) {
      biggerStories++;
      for (const story of bigger.stories ?? []) {
        stories++;
        const ids = story.article_ids ?? [];
        if (ids.length > 1) merged++;
        for (const id of ids) seen.set(id, (seen.get(id) ?? 0) + 1);
      }
    }
  }

  const unassigned = new Set((run.tree.unassigned ?? []).map((u) => u.article_id));

  return {
    categories: run.tree.categories.length,
    biggerStories,
    stories,
    covered: seen.size,
    merged,
    duplicated: [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id),
    missing: run.articles
      .map((a) => a.id)
      .filter((id) => !seen.has(id) && !unassigned.has(id)),
    unassigned: unassigned.size,
  };
}

function render(run: CategorizeRun, stats: RunStats): string {
  const byId = new Map(run.articles.map((a) => [a.id, a]));
  const lines: string[] = [
    `# ${run.model}`,
    "",
    `${run.articles.length} articles · ${(run.elapsedMs / 1000).toFixed(1)}s`,
    "",
    `- categories: ${stats.categories}`,
    `- bigger stories: ${stats.biggerStories}`,
    `- stories: ${stats.stories} (${stats.merged} merging two or more articles)`,
    `- articles placed: ${stats.covered}/${run.articles.length}` +
      `, unassigned: ${stats.unassigned}` +
      (stats.missing.length ? `, dropped: ${stats.missing.join(", ")}` : "") +
      (stats.duplicated.length
        ? `, used twice: ${stats.duplicated.join(", ")}`
        : ""),
    "",
  ];

  for (const category of run.tree.categories) {
    lines.push(`## ${category.category}`, "");
    for (const bigger of category.bigger_stories ?? []) {
      const tag = bigger.standalone ? " _(standalone)_" : "";
      lines.push(`### ${bigger.bigger_story}${tag}`, "");
      for (const story of bigger.stories ?? []) {
        lines.push(`- **${story.story}**`);
        for (const id of story.article_ids ?? []) {
          lines.push(`  - ${describe(byId.get(id), id)}`);
        }
      }
      lines.push("");
    }
  }

  if (run.tree.unassigned?.length) {
    lines.push("## Unassigned", "");
    for (const item of run.tree.unassigned) {
      lines.push(
        `- ${describe(byId.get(item.article_id), item.article_id)} — ${item.reason}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function describe(article: RecentArticle | undefined, id: number): string {
  if (!article) return `[${id}] (unknown article id)`;
  return `[${id}] (${article.source}) ${article.title}`;
}

function parseArgs(argv: string[]) {
  const models: string[] = [];
  let limit = 20;
  let out = join(process.cwd(), "tmp", "stories");

  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1];
    switch (argv[i]) {
      case "--model":
        if (value) models.push(value);
        i++;
        break;
      case "--limit":
        limit = Number(value) || limit;
        i++;
        break;
      case "--out":
        if (value) out = value;
        i++;
        break;
    }
  }

  return { models, limit, out };
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closePool);
