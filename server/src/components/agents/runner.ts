import * as sessions from "../../models/agentSessions";
import { ChatMessage, sendChat } from "../ai/OpenRouter";
import { describeTools, parseToolCalls } from "./protocol";
import { AgentContext, AgentDefinition, ToolCall } from "./types";

export type AgentRun = {
  sessionId: number;
  /** The model's last message, with any trailing <|DONE|> stripped. */
  answer: string;
  steps: number;
  promptTokens: number;
  completionTokens: number;
  elapsedMs: number;
  /** True when the loop hit maxSteps instead of the agent saying it was done. */
  exhausted: boolean;
};

export type RunOptions = {
  model: string;
  /** The task, as the opening user message. */
  task: string;
  /** The dashboard the agent is confined to. */
  dashboardId: string;
  /** Progress reporting; the runner itself never prints. */
  log?: (message: string) => void;
};

/**
 * Runs one agent to completion: send the conversation, execute whatever
 * functions the model asked for, hand the results back, repeat. Every turn is
 * persisted as it happens, so a session that crashes mid-way still has a
 * readable transcript.
 */
export async function runAgent(
  agent: AgentDefinition,
  options: RunOptions,
): Promise<AgentRun> {
  const { model, task, dashboardId } = options;
  const ctx: AgentContext = { dashboardId };
  const log = options.log ?? (() => undefined);
  const started = Date.now();

  const system = `${agent.instructions}\n\n${describeTools(agent.tools)}`;
  const session = await sessions.start(agent.kind, model, dashboardId);

  await sessions.append(session.id, { role: "system", content: system });
  await sessions.append(session.id, { role: "user", content: task });

  const conversation: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: task },
  ];

  let promptTokens = 0;
  let completionTokens = 0;
  let steps = 0;

  try {
    while (steps < agent.maxSteps) {
      steps++;
      const { content, usage } = await sendChat(model, conversation);
      promptTokens += usage.promptTokens;
      completionTokens += usage.completionTokens;

      conversation.push({ role: "assistant", content });
      await sessions.append(session.id, {
        role: "assistant",
        content,
        model: usage.model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      });

      const calls = parseToolCalls(content).filter((c) => c.name !== "DONE");

      if (calls.length === 0) {
        await sessions.finish(session.id);
        return {
          sessionId: session.id,
          answer: content.replace(/<\|\s*DONE\s*\|>/g, "").trim(),
          steps,
          promptTokens,
          completionTokens,
          elapsedMs: Date.now() - started,
          exhausted: false,
        };
      }

      log(`step ${steps}: ${calls.map((c) => c.name).join(", ")}`);

      const results: string[] = [];
      for (const call of calls) {
        const output = await execute(agent, call, ctx);
        await sessions.append(session.id, {
          role: "tool",
          content: output,
          toolName: call.name,
          toolArgs: call.args,
        });
        results.push(`${call.raw}\n${output}`);
      }

      // results go back as a user turn: the text protocol has no separate tool
      // role on the wire, and every model understands a user message
      const reply = results.join("\n\n");
      conversation.push({ role: "user", content: reply });
      await sessions.append(session.id, { role: "user", content: reply });
    }

    await sessions.finish(session.id);
    return {
      sessionId: session.id,
      answer: lastAssistant(conversation),
      steps,
      promptTokens,
      completionTokens,
      elapsedMs: Date.now() - started,
      exhausted: true,
    };
  } catch (e) {
    await sessions.fail(session.id, (e as Error).message);
    throw e;
  }
}

/**
 * Unknown names and failing functions are reported back to the model rather
 * than thrown: a typo should cost one turn, not the whole session.
 */
async function execute(
  agent: AgentDefinition,
  call: ToolCall,
  ctx: AgentContext,
): Promise<string> {
  const tool = agent.tools.find((t) => t.name === call.name);
  if (!tool) {
    const known = agent.tools.map((t) => t.name).join(", ");
    return `ERROR: no such function ${call.name}. Available: ${known}, DONE.`;
  }

  try {
    return await tool.run(call.args, ctx);
  } catch (e) {
    return `ERROR: ${call.name} failed: ${(e as Error).message}`;
  }
}

function lastAssistant(conversation: ChatMessage[]): string {
  for (let i = conversation.length - 1; i >= 0; i--) {
    const message = conversation[i]!;
    if (message.role === "assistant") return message.content;
  }
  return "";
}
