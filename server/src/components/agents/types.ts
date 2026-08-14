/**
 * A function an agent may call. `name` is the token the model writes inside
 * `<| |>`; `run` gets the raw positional arguments it wrote, already split.
 */
export type AgentTool = {
  name: string; // GET_STORYLINES
  usage: string; // `<|GET_STORYLINES 20|>`
  description: string;
  run: (args: string[]) => Promise<string>;
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
