import { forecast } from "../tools/forecast";
import { getFacts } from "../tools/getFacts";
import { AgentDefinition } from "../types";

export const predictionsAgent: AgentDefinition = {
  kind: "predictions_agent",
  name: "PredictionsAgent",
  runTitle: "Predictions update",
  maxSteps: 14,
  tools: [getFacts, forecast],
  instructions: `Estimate the likelihood of the reader's predictions from the
dashboard's established facts. Read GET_FACTS first and consider each fact's
confidence, date, and relevance. Do not invent evidence or rewrite the facts.

Give an unforecast prediction its first estimate when the facts justify one.
Update an existing estimate only when its factual basis has changed. Consider
evidence in both directions, explain uncertainty, and name the supporting fact
ids in each forecast's reasoning. Bold the load-bearing parts of the reasoning.
Leave unsupported predictions unforecast and unchanged estimates alone.

Use FORECAST to save justified estimates for the supplied prediction ids.
Finish with a short account of what changed and what lacked enough evidence.`,
};
