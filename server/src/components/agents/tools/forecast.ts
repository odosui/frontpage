import * as predictions from "../../../models/predictions";
import { AgentTool } from "../types";

/**
 * The analyst's estimate on a claim the reader wrote. It can move the number
 * but never invent the claim — what is worth predicting is the reader's call,
 * and how likely it is is the analyst's.
 *
 * The reasoning is not optional and not decoration. Months later the only way
 * to judge a forecaster is to read what it thought at the time, so a move
 * without a reason is refused before it reaches the database.
 */
export const forecast: AgentTool = {
  name: "FORECAST",
  usage:
    '<|FORECAST 3 4 "Two more terminals halted this week and Reuters now reports the export backlog, so the disruption is holding rather than easing"|>',
  description:
    "Sets the likelihood on a prediction: its id, a rung from 1 to 5, and why you moved it. All three are required — a rung with no reasoning is refused. " +
    "The rungs are 1 highly unlikely, 2 unlikely, 3 even odds, 4 likely, 5 highly likely. Five is as fine as the scale goes: there is no 3.5, and a percentage is not a rung. " +
    "The ids and current rungs are in the list you were given at the top. " +
    "A likelihood is a function of the facts, so record what the coverage established before you set one, and name in the reasoning the facts it turns on. " +
    "A prediction marked 'not yet forecast' should be priced from the facts as they already stand, whether or not anything changed today. One that already has a rung only moves when the facts move. " +
    "Every move is kept with its reasoning, so the reader can read back how your thinking developed.",
  run: async (args, ctx) => {
    const id = Number(args[0]);
    if (!Number.isFinite(id)) {
      return "ERROR: FORECAST needs a prediction id, as a number.";
    }

    const likelihood = Number(args[1]);
    if (!Number.isFinite(likelihood)) {
      return "ERROR: FORECAST needs a likelihood from 1 to 5.";
    }
    if (
      !Number.isInteger(likelihood) ||
      likelihood < predictions.MIN_LIKELIHOOD ||
      likelihood > predictions.MAX_LIKELIHOOD
    ) {
      return `ERROR: ${args[1]} is not a likelihood — it must be a whole number from 1 (highly unlikely) to 5 (highly likely).`;
    }

    const reasoning = args.slice(2).join(" ").trim();
    if (!reasoning) {
      return "ERROR: FORECAST needs the reasoning behind the move. Say what changed and why it points this way.";
    }

    const existing = await predictions.get(ctx.dashboardId, id);
    if (!existing) return `(no prediction #${id} in this dashboard)`;

    const updated = await predictions.forecast(
      ctx.dashboardId,
      id,
      likelihood,
      reasoning,
    );
    if (!updated) return `(no prediction #${id} in this dashboard)`;

    const from =
      existing.likelihood === null
        ? "unforecast"
        : rung(existing.likelihood);
    return `Prediction #${id} moved from ${from} to ${rung(
      updated.likelihood!,
    )}: ${updated.content}`;
  },
};

/** "4/5 (likely)" — the number the tool takes, and what it means. */
function rung(likelihood: number): string {
  return `${likelihood}/5 (${predictions.LIKELIHOOD_LABELS[likelihood]})`;
}
