/**
 * `npm run search -- moscow wildberries attack`
 *
 * The same call the agent makes, printed for a human: it is the fastest way to
 * see what a query actually returns before wiring it into a prompt.
 */
import { search, SearchResult } from "./Brave";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

/** Everything after `--` is the query, so it needs no quoting in the shell. */
const query = process.argv.slice(2).join(" ").trim();

async function main() {
  if (!query) {
    console.error("usage: npm run search -- <query>");
    process.exit(2);
  }

  const results = await search(query);

  console.log(`\n${DIM}${results.length} results for${RESET} ${BOLD}${query}${RESET}`);

  results.forEach((r, i) => console.log(render(r, i + 1)));
  console.log();
}

function render(r: SearchResult, n: number): string {
  const attribution = [r.publisher, r.date ?? r.age].filter(Boolean).join(" · ");

  const lines = [
    `\n${BOLD}${n}. ${r.title}${RESET}`,
    `   ${CYAN}${r.url}${RESET}`,
    attribution ? `   ${DIM}${attribution}${RESET}` : "",
    `   ${wrap(r.description)}`,
    // One of the excerpts is usually the description again, at length.
    ...r.extraSnippets
      .filter((s) => s !== r.description)
      .map((s) => `   ${DIM}· ${wrap(s)}${RESET}`),
  ];

  return lines.filter(Boolean).join("\n");
}

/** Hard-wrapped to the terminal so a long snippet stays inside its indent. */
function wrap(text: string, indent = "   "): string {
  const width = Math.min(process.stdout.columns || 100, 100) - indent.length;
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    if (line && line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);

  return lines.join(`\n${indent}`);
}

main().catch((err: unknown) => {
  console.error(`search failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
