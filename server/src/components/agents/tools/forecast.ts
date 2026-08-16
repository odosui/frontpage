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
    '<|FORECAST 3 65 "Two more terminals halted this week and Reuters now reports the export backlog, so the disruption is holding rather than easing"|>',
  description:
    "Sets the probability on a prediction: its id, a number from 0 to 100, and why you moved it. All three are required — a probability with no reasoning is refused. " +
    "The ids and current probabilities are in the list you were given at the top. " +
    "A probability is a function of the facts, so record what the coverage established before you set one, and name in the reasoning the facts it turns on. " +
    "A prediction marked 'not yet forecast' should be priced from the facts as they already stand, whether or not anything changed today. One that already has a number only moves when the facts move. " +
    "Every move is kept with its reasoning, so the reader can read back how your thinking developed.",
  run: async (args, ctx) => {
    const id = Number(args[0]);
    if (!Number.isFinite(id)) {
      return "ERROR: FORECAST needs a prediction id, as a number.";
    }

    const probability = Number(args[1]);
    if (!Number.isFinite(probability)) {
      return "ERROR: FORECAST needs a probability from 0 to 100.";
    }
    if (probability < 0 || probability > 100) {
      return `ERROR: ${args[1]} is not a probability — it must be between 0 and 100.`;
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
      probability,
      reasoning,
    );
    if (!updated) return `(no prediction #${id} in this dashboard)`;

    const from =
      existing.probability === null
        ? "unforecast"
        : `${existing.probability}%`;
    return `Prediction #${id} moved from ${from} to ${updated.probability}%: ${updated.content}`;
  },
};
