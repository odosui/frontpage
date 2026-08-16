/**
 * The interactive half of the agent machinery. `runAgent` is one shot: a task
 * goes in, an answer comes out, the session closes. A chat session instead
 * stays open and is replayed from the database on every turn, so the person on
 * the other end can keep asking.
 *
 * Everything else is shared — the same tools, the same `<|CALL|>` protocol, the
 * same transcript table the agents view already reads.
 */
import * as sessions from "../../models/agentSessions";
import { ChatMessage } from "../ai/OpenRouter";
import { sendChat } from "../ai/OpenRouter";
import { GENERAL } from "./general";
import { describeTools, parseToolCalls } from "./protocol";
import { execute } from "./runner";
import { AgentContext, AgentDefinition } from "./types";

export type StartChatOptions = {
  model: string;
  dashboardId: string;
  /**
   * What this conversation is about, in one line — the storyline the chat was
   * opened from. It joins the system message, so it holds for every turn
   * without being repeated into the transcript.
   */
  context?: string;
};

export type ChatTurn = {
  /** The agent's reply, with any trailing <|DONE|> stripped. */
  answer: string;
  /** Model calls this turn took, tool round-trips included. */
  steps: number;
  promptTokens: number;
  completionTokens: number;
  /** True when the turn hit maxSteps with the agent still calling tools. */
  exhausted: boolean;
};

/** Opens a session with its system message and nothing said yet. */
export async function startChat(
  agent: AgentDefinition,
  options: StartChatOptions,
): Promise<{ sessionId: number }> {
  const system = [
    GENERAL,
    agent.instructions.trim(),
    options.context ? `THIS CONVERSATION\n\n${options.context}` : "",
    describeTools(agent.tools),
  ]
    .filter(Boolean)
    .join("\n\n");

  const session = await sessions.start(
    agent.kind,
    options.model,
    options.dashboardId,
  );
  await sessions.append(session.id, { role: "system", content: system });
  return { sessionId: session.id };
}

/**
 * One turn: the question goes in, the agent looks things up as often as it
 * wants, and the answer comes back. Every message is appended as it happens, so
 * a caller polling the transcript sees the tool calls while they are still
 * being made rather than all at once at the end.
 */
export async function reply(
  agent: AgentDefinition,
  sessionId: number,
  question: string,
): Promise<ChatTurn> {
  const session = await sessions.get(sessionId);
  if (!session) throw new Error(`no such session ${sessionId}`);
  if (!session.dashboardId) {
    throw new Error(`session ${sessionId} is not attached to a dashboard`);
  }

  const ctx: AgentContext = { dashboardId: session.dashboardId };
  const conversation = await replay(sessionId);
  conversation.push({ role: "user", content: question });

  // `running` on a chat means someone is waiting on this turn — between turns
  // the session is finished, so the agents view doesn't show it thinking
  // forever. It also clears the error left by a turn that went wrong.
  await sessions.resume(sessionId);
  await sessions.append(sessionId, { role: "user", content: question });

  let promptTokens = 0;
  let completionTokens = 0;
  let steps = 0;

  try {
    while (steps < agent.maxSteps) {
      steps++;
      const { content, usage } = await sendChat(session.model, conversation);
      promptTokens += usage.promptTokens;
      completionTokens += usage.completionTokens;

      conversation.push({ role: "assistant", content });
      await sessions.append(sessionId, {
        role: "assistant",
        content,
        model: usage.model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      });

      const calls = parseToolCalls(content).filter((c) => c.name !== "DONE");
      if (calls.length === 0) {
        await sessions.finish(sessionId);
        return {
          answer: clean(content),
          steps,
          promptTokens,
          completionTokens,
          exhausted: false,
        };
      }

      const results: string[] = [];
      for (const call of calls) {
        const output = await execute(agent, call, ctx);
        await sessions.append(sessionId, {
          role: "tool",
          content: output,
          toolName: call.name,
          toolArgs: call.args,
        });
        results.push(`${call.raw}\n${output}`);
      }

      // Only the tool rows are persisted. The model needs these results as a
      // user turn — the text protocol has no tool role on the wire — but
      // storing that turn too would put every result in the transcript twice,
      // the second time attributed to the person asking. `replay` rebuilds it.
      conversation.push({ role: "user", content: results.join("\n\n") });
    }

    // Out of steps mid-investigation. The person is waiting on something, so
    // they get the last thing the agent said rather than an error.
    await sessions.finish(sessionId);
    return {
      answer: clean(lastAssistant(conversation)),
      steps,
      promptTokens,
      completionTokens,
      exhausted: true,
    };
  } catch (e) {
    // The question stays in the transcript and the session can be asked again,
    // so a failed turn is a failed turn rather than a dead conversation.
    await sessions.fail(sessionId, (e as Error).message);
    throw e;
  }
}

/**
 * The conversation as the model last saw it, rebuilt from the transcript.
 *
 * Tool results are stored one row per call, but the model was handed them as a
 * single user turn — so a run of tool rows collapses back into one message
 * here, in the shape the agent read the first time round.
 */
async function replay(sessionId: number): Promise<ChatMessage[]> {
  const stored = await sessions.messages(sessionId);
  const conversation: ChatMessage[] = [];
  let pending: string[] = [];

  const flush = () => {
    if (pending.length === 0) return;
    conversation.push({ role: "user", content: pending.join("\n\n") });
    pending = [];
  };

  for (const message of stored) {
    if (message.role === "tool") {
      pending.push(`${callOf(message)}\n${message.content}`);
      continue;
    }
    flush();
    conversation.push({
      role: message.role as ChatMessage["role"],
      content: message.content,
    });
  }
  flush();

  return conversation;
}

/** The call that produced a stored result, written the way the agent wrote it. */
function callOf(message: { toolName: string | null; toolArgs: string[] | null }) {
  const args = (message.toolArgs ?? [])
    .map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg))
    .join(" ");
  return `<|${message.toolName ?? ""}${args ? ` ${args}` : ""}|>`;
}

function clean(content: string): string {
  return content.replace(/<\|\s*DONE\s*\|>/g, "").trim();
}

function lastAssistant(conversation: ChatMessage[]): string {
  for (let i = conversation.length - 1; i >= 0; i--) {
    const message = conversation[i]!;
    if (message.role === "assistant") return message.content;
  }
  return "";
}
