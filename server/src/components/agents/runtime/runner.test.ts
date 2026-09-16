import { beforeEach, describe, expect, it, vi } from "vitest";
import { execute, runAgent } from "./runner";
import * as sessions from "../../../models/agentSessions";
import { sendChat } from "../../ai/OpenRouter";
import { buildSystem } from "./system";
import { AgentDefinition, AgentTool } from "../types";

vi.mock("../../../models/agentSessions", () => ({
  start: vi.fn(),
  append: vi.fn(),
  finish: vi.fn(),
  fail: vi.fn(),
}));
vi.mock("../../ai/OpenRouter", () => ({ sendChat: vi.fn() }));
vi.mock("./system", () => ({ buildSystem: vi.fn() }));

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

/** One model turn, with the usage the runner expects alongside it. */
const turn = (content: string) => ({
  content,
  usage: { model: "m", promptTokens: 1, completionTokens: 1 },
});

describe("runAgent", () => {
  beforeEach(() => {
    vi.mocked(buildSystem).mockResolvedValue("system");
    vi.mocked(sessions.start).mockResolvedValue({ id: 1 } as never);
    vi.mocked(sessions.append).mockResolvedValue(undefined as never);
    vi.mocked(sessions.finish).mockResolvedValue(undefined as never);
    vi.mocked(sendChat).mockReset();
  });

  const run = () =>
    runAgent(agent, { model: "m", task: "t", dashboardId: "d" });

  it("asks again when the agent finishes with a bare <|DONE|>", async () => {
    vi.mocked(sendChat)
      .mockResolvedValueOnce(turn("<|DONE|>") as never)
      .mockResolvedValueOnce(turn("<|DONE|>\nthe answer") as never);

    const result = await run();

    expect(result.answer).toBe("the answer");
    expect(result.steps).toBe(2);
    expect(sendChat).toHaveBeenCalledTimes(2);
  });

  it("takes a real answer on the first turn", async () => {
    vi.mocked(sendChat).mockResolvedValueOnce(turn("<|DONE|>\nthe answer") as never);

    expect((await run()).answer).toBe("the answer");
    expect(sendChat).toHaveBeenCalledTimes(1);
  });

  it("asks again when the caller cannot use the answer", async () => {
    vi.mocked(sendChat)
      .mockResolvedValueOnce(turn("<|DONE|>\nsorry, no json") as never)
      .mockResolvedValueOnce(turn('<|DONE|>\n{"ok":1}') as never);

    const result = await runAgent(agent, {
      model: "m",
      task: "t",
      dashboardId: "d",
      checkAnswer: (answer) =>
        answer.includes("{") ? null : "that was not json, send it again",
    });

    expect(result.answer).toBe('{"ok":1}');
    expect(result.steps).toBe(2);
    expect(sessions.append).toHaveBeenCalledWith(1, {
      role: "user",
      content: "that was not json, send it again",
    });
  });

  it("gives up on an agent that only ever says <|DONE|>", async () => {
    vi.mocked(sendChat).mockResolvedValue(turn("<|DONE|>") as never);

    const result = await run();

    // the empty turns are bounded by maxSteps rather than looping for ever
    expect(result.steps).toBe(agent.maxSteps);
    expect(result.answer).toBe("");
  });
});
