import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { SMALL_MODEL } from "../components/ai/models";
import { costOf, loadPrices } from "../components/ai/pricing";
import { categorizingAgent } from "../components/agents/categorizing";
import { runAgent } from "../components/agents/runner";
import { getAgent } from "../components/agents/registry";
import { parseTree, recentArticles } from "../components/stories/categorize";
import { categorizeStoriesPrompt } from "../components/stories/prompt";
import * as sessions from "../models/agentSessions";
import { closePool } from "../db/pool";

/**
 * Runs one agent against the newest articles and writes the transcript out.
 * Unlike `npm run stories`, the model here decides for itself what context to
 * pull before answering.
 *
 *   npm run agent -- --limit 40 --model anthropic/claude-haiku-4.5
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const agent = getAgent(args.kind);

  const articles = await recentArticles(args.limit);
  if (articles.length === 0) {
    throw new Error("no articles in the database — refresh a channel first");
  }
  console.log(
    `${agent.name} · ${args.model} · ${articles.length} articles · ` +
      `${agent.tools.length} functions\n`,
  );

  const run = await runAgent(agent, {
    model: args.model,
    task: categorizeStoriesPrompt(articles),
    log: (message) => console.log(`  ${message}`),
  });

  const prices = await loadPrices().catch(() => new Map());
  const cost = costOf(
    prices,
    args.model,
    run.promptTokens,
    run.completionTokens,
  );

  console.log(
    `\nsession ${run.sessionId} · ${run.steps} steps` +
      (run.exhausted ? " (hit the step limit)" : "") +
      ` · ${(run.elapsedMs / 1000).toFixed(1)}s` +
      ` · ${run.promptTokens}→${run.completionTokens} tokens` +
      ` · ${cost === null ? "cost unknown" : `$${cost.toFixed(5)}`}`,
  );

  try {
    const tree = parseTree(run.answer);
    const stories = tree.storylines.flatMap((s) => s.stories ?? []);
    console.log(
      `answer: ${tree.storylines.length} storylines, ${stories.length} stories`,
    );
  } catch (e) {
    console.log(`answer did not parse as a story tree: ${(e as Error).message}`);
  }

  mkdirSync(args.out, { recursive: true });
  const base = join(args.out, `session-${run.sessionId}`);
  writeFileSync(`${base}.md`, await transcript(run.sessionId));
  writeFileSync(`${base}.answer.txt`, run.answer + "\n");
  console.log(`→ ${base}.md`);
}

/** The conversation as it happened, for reading back what the agent looked up. */
async function transcript(sessionId: number): Promise<string> {
  const turns = await sessions.messages(sessionId);
  const lines: string[] = [`# agent session ${sessionId}`, ""];

  for (const turn of turns) {
    const header =
      turn.role === "tool"
        ? `## ${turn.position}. tool ${turn.toolName} ${(turn.toolArgs ?? []).join(" ")}`
        : `## ${turn.position}. ${turn.role}` +
          (turn.promptTokens !== null
            ? ` (${turn.promptTokens}→${turn.completionTokens} tokens)`
            : "");
    lines.push(header, "", "```", turn.content, "```", "");
  }

  return lines.join("\n");
}

function parseArgs(argv: string[]) {
  let kind = categorizingAgent.kind;
  let model = SMALL_MODEL;
  let limit = 40;
  let out = join(process.cwd(), "tmp", "agents");

  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1];
    switch (argv[i]) {
      case "--kind":
        if (value) kind = value;
        i++;
        break;
      case "--model":
        if (value) model = value;
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

  return { kind, model, limit, out };
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closePool);
