import { AgentDefinition } from "./types";
import { analyzingAgent } from "./analyzing";
import { categorizingAgent } from "./categorizing";
import { factsAgent } from "./facts";

const AGENTS: Record<string, AgentDefinition> = {
  [categorizingAgent.kind]: categorizingAgent,
  [analyzingAgent.kind]: analyzingAgent,
  [factsAgent.kind]: factsAgent,
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
