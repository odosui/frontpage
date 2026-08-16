import * as sessions from "../../models/agentSessions";
import { reply } from "../../components/agents/chat";
import { getAgent } from "../../components/agents/registry";
import { JobHandler } from "../types";

export type AgentReplyPayload = {
  sessionId: number;
  /** What the person just asked. */
  question: string;
};

/**
 * One turn of a chat, in the worker. Queued rather than answered inside the
 * request for the same reason a run is: a turn that stops to search the web
 * twice can take a minute, and the ui follows it by polling the transcript.
 *
 * A turn that throws leaves the session usable — the question stays in the
 * transcript and the job carries the error, so asking again is all it takes.
 */
export const agentReplyHandler: JobHandler = async (payload, { log }) => {
  const { sessionId, question } = payload as AgentReplyPayload;
  if (!sessionId || !question) {
    throw new Error("agent_reply requires a sessionId and a question");
  }

  const session = await sessions.get(sessionId);
  if (!session) throw new Error(`no such session ${sessionId}`);

  const agent = getAgent(session.kind);
  const turn = await reply(agent, sessionId, question);

  log(
    `session ${sessionId} answered in ${turn.steps} steps` +
      (turn.exhausted ? " (hit the step limit)" : ""),
  );

  return {
    result: {
      sessionId,
      steps: turn.steps,
      exhausted: turn.exhausted,
      promptTokens: turn.promptTokens,
      completionTokens: turn.completionTokens,
    },
  };
};
