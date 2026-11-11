import { AgentTool, ToolCall } from "../types";

/** Where a call starts: `<|` and the function's name. */
const OPEN_RE = /<\|\s*([A-Z][A-Z0-9_]*)/g;

/**
 * Quoted arguments stay in one piece: `<|GREP_TAGS "united states" 10|>`.
 *
 * A quote inside a quoted argument may be escaped, `\"`, which models do by
 * habit from json whether or not they were asked to. Without that branch the
 * escape closed the string early and the rest of the sentence arrived as one
 * bare word per space — which REVISE_FACTS then wrote down as one fact per
 * word. An argument is quoted or it is not; there is no half-quoted.
 */
const ARG_RE = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(\S+)/g;

/** `\"` and `\\` mean the character after the backslash, inside a quoted argument. */
function unescape(text: string): string {
  return text.replace(/\\(.)/g, "$1");
}

/**
 * The calls in a message, in order.
 *
 * A call is `<|NAME args|>`. One the model left open — no `|>` before the
 * next `<|`, or none at all — still counts, and ends where the next marker
 * begins or the message does. That is not hypothetical: a long REVISE_FACTS,
 * paragraphs of quoted facts, has been written with the closing `|>` dropped
 * and `<|DONE|>` straight after it. Read strictly, the run's whole work was
 * the one call the parser could not see, and the run ended having saved
 * nothing.
 */
export function parseToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  // A model that writes the same call twice in one message — once as the call
  // and again while explaining itself — asked one question, not two. Running
  // it twice would cost the same query and paste the same result back in
  // twice, so identical calls collapse to the first.
  const seen = new Set<string>();
  OPEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = OPEN_RE.exec(text)) !== null) {
    const name = match[1]!;
    const from = OPEN_RE.lastIndex;
    const close = text.indexOf("|>", from);
    const nextOpen = text.indexOf("<|", from);
    const closed = close !== -1 && (nextOpen === -1 || close < nextOpen);
    const to = closed ? close : nextOpen === -1 ? text.length : nextOpen;
    const end = closed ? close + 2 : to;
    OPEN_RE.lastIndex = end;

    const args = parseArgs(text.slice(from, to));
    const key = `${name}\u0000${args.join("\u0000")}`;
    if (seen.has(key)) continue;
    seen.add(key);

    calls.push({ name, args, raw: text.slice(match.index, end).trimEnd() });
  }
  return calls;
}

function parseArgs(rest: string): string[] {
  const args: string[] = [];
  ARG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ARG_RE.exec(rest)) !== null) {
    // only the quoted branches carry escapes; a bare word is taken as typed
    if (match[1] !== undefined) args.push(unescape(match[1]));
    else if (match[2] !== undefined) args.push(unescape(match[2]));
    else args.push(match[3] ?? "");
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
  Not a function: nothing comes back from it, and no further message follows
  it. It marks that this message is your answer, so the answer itself has to be
  in this same message, written straight after it. A message containing
  <|DONE|> and nothing else says you are finished and then says nothing — it is
  the one message that cannot be completed later, and it is read as an empty
  answer.

How it works:
- Write one or more calls and then STOP. Do not continue your answer past a
  call, and never guess what a function would have returned. That rule is about
  the functions above, which answer you in the next message. <|DONE|> is not one
  of them: there is no next message to wait for, so it is never a reason to stop
  writing.
- The results come back in the next message, then you carry on.
- Call nothing at all only when you are ready to give the final answer, and in
  that case start the message with <|DONE|>.
- A message either calls functions or answers — never both. <|DONE|> alongside
  a call is a contradiction: you cannot be finished while you are still waiting
  to be told something. Anything you write after a call is a guess at the
  result, and the person reading you cannot tell it apart from the answer you
  give once you actually know.
- That is an order, not a cost. It says which message the answer goes in, not
  whether you may look something up: needing a lookup is never a reason to
  answer without one. A turn spent calling costs the person reading you
  nothing — they see your answer when it arrives, one message later.
- So if a function would tell you the thing you are about to state, call it.
  Never say you cannot call one, or that you cannot both look and answer, and
  then answer anyway from what you happen to remember or from the summary you
  were given at the top. That summary is a convenience, always partial and
  possibly stale; the functions are what this system actually knows. A guess
  offered in place of a lookup you could have made is the one failure this
  protocol exists to prevent.`;
}
