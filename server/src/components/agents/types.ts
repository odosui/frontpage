/**
 * A function an agent may call. `name` is the token the model writes inside
 * `<| |>`; `run` gets the raw positional arguments it wrote, already split.
 */
/**
 * An agent lives inside one dashboard: every function it calls sees only that
 * dashboard's rows, and everything it writes lands there.
 */
export type AgentContext = {
  dashboardId: string;
  /**
   * The conversation this call belongs to. A tool that proposes a change files
   * it against the session, so the person reading that session is the one asked
   * to approve it.
   */
  sessionId: number;
};

export type AgentTool = {
  name: string; // GET_STORYLINES
  usage: string; // `<|GET_STORYLINES 20|>`
  description: string;
  /**
   * True for a tool that asks to change something rather than reading it.
   * Such a call is refused when it shares a message with other calls: batched
   * beside its own lookups it would run before their results came back, which
   * is a decision taken without the evidence it was supposed to rest on.
   */
  mutates?: boolean;
  run: (args: string[], ctx: AgentContext) => Promise<string>;
};

export type AgentDefinition = {
  kind: string;
  name: string;
  tools: AgentTool[];
  instructions: string;
  maxSteps: number;
};

export type ToolCall = {
  name: string;
  args: string[];
  raw: string;
};
