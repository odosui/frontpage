import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import {
  CategorizeRun,
  RecentArticle,
  categorize,
  uncategorizedArticles,
} from "../components/stories/categorize";
import { BIG_MODEL } from "../components/ai/models";
import { ModelPrice, costOf, loadPrices } from "../components/ai/pricing";
import { closePool } from "../db/pool";

/**
 * Groups the newest articles into storyline → story → tagged article with one
 * or more models and writes the results out for comparison, with what each run
 * cost.
 *
 *   npm run stories -- --limit 20 --model google/gemini-3.1-flash-lite \
 *                      --model google/gemini-3.1-pro-preview
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const models = args.models.length > 0 ? args.models : [BIG_MODEL];

  const articles = await uncategorizedArticles(args.dashboard, {
    limit: args.limit,
  });
  if (articles.length === 0) {
    throw new Error(
      `no uncategorized articles in ${args.dashboard} — refresh a channel first`,
    );
  }
  console.log(`${articles.length} articles, ${models.length} model(s)\n`);

  const prices = await loadPrices().catch(() => new Map<string, ModelPrice>());

  mkdirSync(args.out, { recursive: true });

  const table: RunStats[] = [];

  for (const model of models) {
    process.stdout.write(`${model} … `);
    try {
      const run = await categorize(model, articles);
      const stats = summarize(run, prices);
      table.push(stats);
      console.log(
        `${(run.elapsedMs / 1000).toFixed(1)}s · ${stats.storylines} storylines · ` +
          `${stats.stories} stories · ${stats.covered}/${articles.length} articles · ` +
          `${stats.uniqueTags} tags · ${money(stats.cost)}`,
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

  if (table.length > 1) console.log(comparison(table));
}

export type RunStats = {
  model: string;
  storylines: number;
  stories: number;
  /** Articles placed in some story — the rest were dropped or unassigned. */
  covered: number;
  merged: number;
  duplicated: number[];
  missing: number[];
  unassigned: number;
  /** Distinct tag strings across the whole run. */
  uniqueTags: number;
  /** Mean tags per placed article; the prompt asks for 3–5. */
  tagsPerArticle: number;
  /** Articles the model tagged with fewer than 3 or more than 5. */
  offSpecTags: number;
  /**
   * Tag strings that differ only by case, spacing or punctuation from another
   * tag — the near-duplicates the prompt tries to prevent.
   */
  nearDuplicateTags: string[][];
  seconds: number;
  promptTokens: number;
  completionTokens: number;
  cost: number | null;
};

/** The numbers worth comparing between models. */
function summarize(
  run: CategorizeRun,
  prices: Map<string, ModelPrice>,
): RunStats {
  const seen = new Map<number, number>();
  const tagCounts: number[] = [];
  const tags = new Set<string>();
  let stories = 0;
  let merged = 0;
  let offSpecTags = 0;

  for (const storyline of run.tree.storylines) {
    for (const story of storyline.stories ?? []) {
      stories++;
      const placed = story.articles ?? [];
      if (placed.length > 1) merged++;
      for (const article of placed) {
        seen.set(article.id, (seen.get(article.id) ?? 0) + 1);
        const own = article.tags ?? [];
        tagCounts.push(own.length);
        if (own.length < 3 || own.length > 5) offSpecTags++;
        for (const tag of own) tags.add(tag);
      }
    }
  }

  const unassigned = new Set(
    (run.tree.unassigned ?? []).map((u) => u.article_id),
  );

  const totalTags = tagCounts.reduce((sum, n) => sum + n, 0);

  return {
    model: run.model,
    storylines: run.tree.storylines.length,
    stories,
    covered: seen.size,
    merged,
    duplicated: [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id),
    missing: run.articles
      .map((a) => a.id)
      .filter((id) => !seen.has(id) && !unassigned.has(id)),
    unassigned: unassigned.size,
    uniqueTags: tags.size,
    tagsPerArticle: tagCounts.length ? totalTags / tagCounts.length : 0,
    offSpecTags,
    nearDuplicateTags: nearDuplicates(tags),
    seconds: run.elapsedMs / 1000,
    promptTokens: run.usage.promptTokens,
    completionTokens: run.usage.completionTokens,
    cost: costOf(
      prices,
      run.model,
      run.usage.promptTokens,
      run.usage.completionTokens,
    ),
  };
}

/**
 * Tags that collapse to the same string once case, punctuation and spacing go
 * away — "us election" vs "U.S. Elections". A tag vocabulary is only useful if
 * the same idea always gets the same string, so this is the metric that decides
 * whether a model's tags are usable as rows in the `tags` table.
 */
function nearDuplicates(tags: Set<string>): string[][] {
  const byKey = new Map<string, string[]>();
  for (const tag of tags) {
    const key = tag
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .replace(/s$/, "");
    byKey.set(key, [...(byKey.get(key) ?? []), tag]);
  }
  return [...byKey.values()].filter((group) => group.length > 1);
}

function money(cost: number | null): string {
  return cost === null ? "cost unknown" : `$${cost.toFixed(5)}`;
}

/** Side-by-side ranking, printed once every model has run. */
function comparison(table: RunStats[]): string {
  const rows = [...table].sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0));
  const lines = [
    "",
    "model                                          cost      s   lines  stories  cov  tags  t/art  dup",
  ];
  for (const r of rows) {
    lines.push(
      [
        r.model.padEnd(44).slice(0, 44),
        money(r.cost).padStart(10),
        r.seconds.toFixed(1).padStart(5),
        String(r.storylines).padStart(6),
        String(r.stories).padStart(8),
        String(r.covered).padStart(5),
        String(r.uniqueTags).padStart(5),
        r.tagsPerArticle.toFixed(1).padStart(6),
        String(r.nearDuplicateTags.length).padStart(4),
      ].join(" "),
    );
  }
  return lines.join("\n");
}

function render(run: CategorizeRun, stats: RunStats): string {
  const byId = new Map(run.articles.map((a) => [a.id, a]));
  const lines: string[] = [
    `# ${run.model}`,
    "",
    `${run.articles.length} articles · ${stats.seconds.toFixed(1)}s · ` +
      `${stats.promptTokens}→${stats.completionTokens} tokens · ${money(stats.cost)}`,
    "",
    `- storylines: ${stats.storylines}`,
    `- stories: ${stats.stories} (${stats.merged} merging two or more articles)`,
    `- articles placed: ${stats.covered}/${run.articles.length}` +
      `, unassigned: ${stats.unassigned}` +
      (stats.missing.length ? `, dropped: ${stats.missing.join(", ")}` : "") +
      (stats.duplicated.length
        ? `, used twice: ${stats.duplicated.join(", ")}`
        : ""),
    `- tags: ${stats.uniqueTags} distinct, ` +
      `${stats.tagsPerArticle.toFixed(1)} per article` +
      (stats.offSpecTags ? `, ${stats.offSpecTags} outside 3–5` : ""),
    ...(stats.nearDuplicateTags.length
      ? [
          `- near-duplicate tags: ` +
            stats.nearDuplicateTags
              .map((group) => group.join(" / "))
              .join(", "),
        ]
      : []),
    "",
  ];

  for (const storyline of run.tree.storylines) {
    const standalone = storyline.standalone ? " _(standalone)_" : "";
    lines.push(`## ${storyline.storyline}${standalone}`, "");
    for (const story of storyline.stories ?? []) {
      lines.push(`- **${story.story}**`);
      for (const article of story.articles ?? []) {
        const tags = (article.tags ?? []).map((t) => `\`${t}\``).join(" ");
        lines.push(`  - ${describe(byId.get(article.id), article.id)}`);
        if (tags) lines.push(`    ${tags}`);
      }
    }
    lines.push("");
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
  let dashboard = "default";
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
      case "--dashboard":
        if (value) dashboard = value;
        i++;
        break;
      case "--out":
        if (value) out = value;
        i++;
        break;
    }
  }

  return { models, limit, dashboard, out };
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closePool);
