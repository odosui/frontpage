import { runAgent } from "../../components/agents/runner";
import { factsAgent } from "../../components/agents/facts";
import { establishFactsPrompt } from "../../components/facts/prompt";
import { BIG_MODEL } from "../../components/ai/models";
import * as dashboards from "../../models/dashboards";
import * as facts from "../../models/facts";
import * as stories from "../../models/stories";
import { JobHandler } from "../types";

export type RunFactsPayload = {
  /** The dashboard the run is confined to. */
  dashboardId: string;
  model?: string;
};

const MAX_STORIES = 50;

/**
 * One pass of the facts agent over an arc's stories.
 *
 * Shorter than the categorizing run, because there is nothing to persist at
 * the end: REVISE_FACTS writes the version itself, as a tool call the reader
 * can see in the transcript. A run that changed nothing therefore leaves no
 * version behind, which is the correct record of a day that settled nothing.
 */
export const runFactsHandler: JobHandler = async (payload, { log }) => {
  const { dashboardId, model } = payload as RunFactsPayload;
  if (!dashboardId) throw new Error("run_facts requires a dashboardId");

  const dashboard = await dashboards.get(dashboardId);
  if (!dashboard) throw new Error(`dashboard ${dashboardId} no longer exists`);

  const [storyFeed, known] = await Promise.all([
    stories.feed(dashboardId, MAX_STORIES),
    facts.forDashboard(dashboardId),
  ]);

  // an arc with nothing filed under it has nothing to read, and asking the
  // model to confirm that costs a call to be told what we already know
  if (storyFeed.length === 0) {
    log(`nothing filed under ${dashboardId} yet — nothing to establish`);
    return { result: { skipped: true, stories: 0 } };
  }
  log(
    `reading ${storyFeed.length} stories in ${dashboardId} against ` +
      `${known.length} standing facts`,
  );

  const run = await runAgent(factsAgent, {
    model: model || BIG_MODEL,
    task: establishFactsPrompt(dashboard.name, storyFeed, known),
    dashboardId,
    log,
  });

  const after = await facts.current(dashboardId);
  log(
    `session ${run.sessionId} finished in ${run.steps} steps` +
      (run.exhausted ? " (hit the step limit)" : "") +
      `; facts now at v${after?.version ?? 0} with ` +
      `${after?.facts.length ?? 0} lines`,
  );

  return {
    result: {
      sessionId: run.sessionId,
      steps: run.steps,
      exhausted: run.exhausted,
      promptTokens: run.promptTokens,
      completionTokens: run.completionTokens,
      elapsedMs: run.elapsedMs,
      version: after?.version ?? 0,
      facts: after?.facts.length ?? 0,
    },
  };
};
