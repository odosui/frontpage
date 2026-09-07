import { predictionsAgent } from "../../components/agents/definitions/predictions";
import { predictionsContext } from "../../components/agents/runtime/context";
import { runAgent } from "../../components/agents/runtime/runner";
import { bigModel } from "../../components/ai/models";
import * as dashboards from "../../models/dashboards";
import * as facts from "../../models/facts";
import * as predictions from "../../models/predictions";
import { attachSession } from "../queue";
import { JobHandler } from "../types";

/** Forecast existing claims from standing facts, independently of story ingestion. */
export const runPredictionsHandler: JobHandler = async (
  payload,
  { log, job },
) => {
  const { dashboardId, model } = payload as {
    dashboardId: string;
    model?: string;
  };
  if (!dashboardId) throw new Error("run_predictions requires a dashboardId");
  const dashboard = await dashboards.get(dashboardId);
  if (!dashboard) throw new Error(`dashboard ${dashboardId} no longer exists`);

  const [standing, claims] = await Promise.all([
    facts.forDashboard(dashboardId),
    predictions.forDashboard(dashboardId),
  ]);
  if (standing.length === 0 || claims.length === 0) {
    log(
      standing.length === 0
        ? "No established facts to forecast from."
        : "No predictions to forecast yet.",
    );
    return {
      result: {
        skipped: true,
        facts: standing.length,
        predictions: claims.length,
      },
    };
  }

  const run = await runAgent(predictionsAgent, {
    model: model || (await bigModel()),
    dashboardId,
    task: [
      `Today is ${new Date().toISOString().slice(0, 10)}.`,
      `Forecast the predictions for "${dashboard.name}" from its established facts. Start with GET_FACTS.`,
      predictionsContext(claims),
    ].join("\n\n"),
    log,
    onSession: (id) => attachSession(job.id, id),
  });
  log(`session ${run.sessionId} finished in ${run.steps} steps`);
  return {
    result: {
      sessionId: run.sessionId,
      steps: run.steps,
      exhausted: run.exhausted,
      promptTokens: run.promptTokens,
      completionTokens: run.completionTokens,
      elapsedMs: run.elapsedMs,
    },
  };
};
