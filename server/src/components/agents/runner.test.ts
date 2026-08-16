import { describe, expect, it } from "vitest";
import { execute } from "./runner";
import { AgentDefinition, AgentTool } from "./types";

const reader: AgentTool = {
  name: "READ_IT",
  usage: "<|READ_IT|>",
  description: "reads",
  run: async () => "read",
};

const writer: AgentTool = {
  name: "CHANGE_IT",
  usage: "<|CHANGE_IT|>",
  description: "changes",
  mutates: true,
  run: async () => "changed",
};

const agent: AgentDefinition = {
  kind: "test_agent",
  name: "TestAgent",
  maxSteps: 4,
  tools: [reader, writer],
  instructions: "",
};

const ctx = { dashboardId: "d", sessionId: 1 };
const call = (name: string) => ({ name, args: [], raw: `<|${name}|>` });

describe("execute", () => {
  it("runs a mutating tool that came on its own", async () => {
    expect(await execute(agent, call("CHANGE_IT"), ctx, 1)).toBe("changed");
  });

  it("refuses a mutating tool batched with other calls", async () => {
    const out = await execute(agent, call("CHANGE_IT"), ctx, 3);

    expect(out).toMatch(/^ERROR/);
    expect(out).toContain("cannot share a message");
  });

  it("still runs reads that shared the message", async () => {
    expect(await execute(agent, call("READ_IT"), ctx, 3)).toBe("read");
  });

  it("reports an unknown function rather than throwing", async () => {
    expect(await execute(agent, call("NOPE"), ctx, 1)).toContain(
      "no such function NOPE",
    );
  });
});
