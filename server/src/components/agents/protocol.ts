import { AgentTool, ToolCall } from "./types";

/**
 * Calls are written in the model's own text as `<|NAME arg arg|>` rather than
 * through the provider's tool-calling api. That keeps every OpenRouter model
 * usable, including the cheap ones with no native tool support, at the cost of
 * parsing prose — hence the deliberately unmistakable delimiters.
 */
const CALL_RE = /<\|\s*([A-Z][A-Z0-9_]*)([^|]*)\|>/g;

/** Quoted arguments stay in one piece: `<|GREP_TAGS "united states" 10|>`. */
const ARG_RE = /"([^"]*)"|'([^']*)'|(\S+)/g;

export function parseToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  CALL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = CALL_RE.exec(text)) !== null) {
    calls.push({
      name: match[1]!,
      args: parseArgs(match[2] ?? ""),
      raw: match[0],
    });
  }
  return calls;
}

function parseArgs(rest: string): string[] {
  const args: string[] = [];
  ARG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ARG_RE.exec(rest)) !== null) {
    args.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return args;
}

/** The tool reference appended to every agent's instructions. */
export function describeTools(tools: AgentTool[]): string {
  const lines = tools.map((t) => `- ${t.usage}\n  ${t.description}`);

  return `FUNCTIONS

You can call the functions below by writing the call on its own line. Write the
call exactly as shown, including the <| |> delimiters:

${lines.join("\n")}

- <|DONE|>
  Call this when you have everything you need, followed by your final answer.

How it works:
- Write one or more calls and then STOP. Do not continue your answer past a
  call, and never guess what a function would have returned.
- The results come back in the next message, then you carry on.
- Call nothing at all only when you are ready to give the final answer, and in
  that case start the message with <|DONE|>.`;
}
