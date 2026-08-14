import { AgentDefinition } from "./types";
import { categorizingAgent } from "./categorizing";

/**
 * Every agent the system knows how to run, by the kind stored on the session.
 * Add new ones here — a kind missing from this map fails loudly.
 */
export const agents: Record<string, AgentDefinition> = {
  [categorizingAgent.kind]: categorizingAgent,
};

export const AGENT_KINDS = Object.keys(agents);

export function getAgent(kind: string): AgentDefinition {
  const agent = agents[kind];
  if (!agent) {
    throw new Error(`unknown agent kind ${kind} — known: ${AGENT_KINDS.join(", ")}`);
  }
  return agent;
}
