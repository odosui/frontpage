import * as dashboards from "../../models/dashboards";
import { GENERAL } from "./general";
import { describeTools } from "./protocol";
import { AgentDefinition } from "./types";

/**
 * The system message every agent starts from: who it is, what this one does,
 * whatever the arc itself asks for, and what it can call.
 *
 * The dashboard's own prompt is read here rather than passed in, so a run
 * started from anywhere — a queued job, a chat opened in the ui — carries it
 * without every caller having to remember to fetch it.
 */
export async function buildSystem(
  agent: AgentDefinition,
  dashboardId: string,
  /** Anything the caller wants said as well, such as a chat's opening context. */
  extra?: string,
): Promise<string> {
  const dashboard = dashboardId ? await dashboards.get(dashboardId) : null;
  const standing = dashboard?.prompt?.trim();

  return [
    GENERAL,
    agent.instructions.trim(),
    // after the job description and before the tools: it qualifies the job
    // rather than replacing it, and the reader who wrote it expects to be
    // obeyed over the generic instructions above
    standing ? `THIS DASHBOARD\n\n${standing}` : "",
    extra ? extra.trim() : "",
    describeTools(agent.tools),
  ]
    .filter(Boolean)
    .join("\n\n");
}
