import { runAgent } from "../../components/agents/runner";
import { getAgent } from "../../components/agents/registry";
import {
  DEFAULT_WINDOW_DAYS,
  parseTree,
  uncategorizedArticles,
} from "../../components/stories/categorize";
import { persistTree } from "../../components/stories/persist";
import { categorizeStoriesPrompt } from "../../components/stories/prompt";
import { SMALL_MODEL } from "../../components/ai/models";
import { JobHandler } from "../types";

export type RunAgentPayload = {
  kind: string;
  /** The dashboard the agent is confined to. */
  dashboardId: string;
  model?: string;
  /** How far back to look for uncategorized articles. */
  days?: number;
  /** Optional cap on the batch; by default the whole window goes in. */
  limit?: number;
};

/**
 * Runs one agent session in the worker. The runner persists every turn as it
 * happens, so the ui can follow along by polling the session while this job is
 * still running — the job result only carries the summary.
 */
export const runAgentHandler: JobHandler = async (payload, { log }) => {
  const { kind, model, days, limit, dashboardId } = payload as RunAgentPayload;
  if (!kind || !dashboardId) {
    throw new Error("run_agent requires a kind and a dashboardId");
  }

  const agent = getAgent(kind);
  const window = days ?? DEFAULT_WINDOW_DAYS;
  const articles = await uncategorizedArticles(dashboardId, {
    days: window,
    limit,
  });
  if (articles.length === 0) {
    throw new Error(
      `every article in ${dashboardId} from the last ${window} days is ` +
        `already categorized — nothing to do`,
    );
  }
  log(
    `${articles.length} uncategorized articles in ${dashboardId} ` +
      `from the last ${window} days`,
  );

  const run = await runAgent(agent, {
    model: model || SMALL_MODEL,
    task: categorizeStoriesPrompt(articles),
    dashboardId,
    log,
  });

  log(
    `session ${run.sessionId} finished in ${run.steps} steps` +
      (run.exhausted ? " (hit the step limit)" : ""),
  );

  // an unparseable answer is a failed run, not a silent no-op: the articles
  // stay uncategorized and the next run picks them up again
  const saved = await persistTree(dashboardId, parseTree(run.answer), articles);
  log(
    `saved ${saved.stories} stories under ${saved.storylines} new / ` +
      `${saved.reusedStorylines} existing storylines, ` +
      `${saved.articles} articles, ` +
      `${saved.tags} new / ${saved.reusedTags} existing tags` +
      (saved.unknownIds.length
        ? ` (ignored ${saved.unknownIds.length} invented ids)`
        : ""),
  );

  return {
    result: {
      sessionId: run.sessionId,
      steps: run.steps,
      exhausted: run.exhausted,
      promptTokens: run.promptTokens,
      completionTokens: run.completionTokens,
      elapsedMs: run.elapsedMs,
      saved,
    },
  };
};
