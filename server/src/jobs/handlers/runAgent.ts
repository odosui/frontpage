import { runAgent } from "../../components/agents/runner";
import { getAgent } from "../../components/agents/registry";
import * as dashboards from "../../models/dashboards";
import {
  DEFAULT_WINDOW_DAYS,
  parseTree,
  uncategorizedArticles,
} from "../../components/stories/categorize";
import { persistTree } from "../../components/stories/persist";
import { categorizeStoriesPrompt } from "../../components/stories/prompt";
import { bigModel } from "../../components/ai/models";
import { JobHandler } from "../types";

export type RunAgentPayload = {
  kind: string;
  /** The dashboard the agent is confined to. */
  dashboardId: string;
  model?: string;
  /** How far back to look for uncategorized articles. */
  days?: number;
};

const BATCH_LIMIT = 75;

/**
 * Runs one agent session in the worker. The runner persists every turn as it
 * happens, so the ui can follow along by polling the session while this job is
 * still running — the job result only carries the summary.
 */
export const runAgentHandler: JobHandler = async (payload, { log }) => {
  const { kind, model, days, dashboardId } = payload as RunAgentPayload;
  if (!kind || !dashboardId) {
    throw new Error("run_agent requires a kind and a dashboardId");
  }

  const agent = getAgent(kind);
  const dashboard = await dashboards.get(dashboardId);
  if (!dashboard) throw new Error(`dashboard ${dashboardId} no longer exists`);

  const window = days ?? DEFAULT_WINDOW_DAYS;
  const articles = await uncategorizedArticles(dashboardId, {
    days: window,
    limit: BATCH_LIMIT,
  });
  // an empty queue is the normal state of a caught-up dashboard, not a
  // failure: finish without spending a model call
  if (articles.length === 0) {
    log(
      `every article in ${dashboardId} from the last ${window} days is ` +
        `already categorized — nothing to do`,
    );
    return { result: { skipped: true, articles: 0 } };
  }
  log(
    `${articles.length} uncategorized articles in ${dashboardId} ` +
      `from the last ${window} days`,
  );

  const run = await runAgent(agent, {
    model: model || (await bigModel()),
    task: categorizeStoriesPrompt(dashboard.name, articles),
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
    `saved ${saved.stories} new / ${saved.reusedStories} existing stories, ` +
      `${saved.articles} articles, ` +
      `${saved.tags} new / ${saved.reusedTags} existing tags, ` +
      `${saved.skipped} skipped as not for this arc` +
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
