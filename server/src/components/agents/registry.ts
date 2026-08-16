import { AgentDefinition } from "./types";
import { categorizingAgent } from "./categorizing";

const AGENTS: Record<string, AgentDefinition> = {
  [categorizingAgent.kind]: categorizingAgent,
};

export const AGENT_KINDS = Object.keys(AGENTS);

export function getAgent(kind: string): AgentDefinition {
  const a = AGENTS[kind];
  if (!a) {
    throw new Error(
      `unknown agent kind ${kind} — known: ${AGENT_KINDS.join(", ")}`,
    );
  }
  return a;
}
