import { beforeEach, describe, expect, it, vi } from "vitest";
import { reply, startChat } from "./chat";
import * as sessions from "../../models/agentSessions";
import { sendChat } from "../ai/OpenRouter";
import { buildSystem } from "./system";
import { AgentDefinition } from "./types";

vi.mock("../../models/agentSessions", () => ({
  get: vi.fn(),
  messages: vi.fn(),
  start: vi.fn(),
  append: vi.fn(),
  resume: vi.fn(),
  finish: vi.fn(),
  fail: vi.fn(),
}));
vi.mock("../ai/OpenRouter", () => ({ sendChat: vi.fn() }));
vi.mock("./system", () => ({ buildSystem: vi.fn() }));
vi.mock("./context", () => ({
  currentContext: vi.fn(async () => "Current dashboard context"),
}));

const write = vi.fn(async () => "updated");
const agent: AgentDefinition = {
  kind: "facts_agent",
  name: "FactsAgent",
  maxSteps: 3,
  instructions: "no conversation",
  tools: [{ name: "REVISE_FACTS", usage: "", description: "", run: write }],
};
const session = {
  id: 252,
  kind: "facts_agent",
  dashboardId: "d",
  status: "finished" as const,
  model: "test-model",
  error: null,
  title: "Facts update",
  createdAt: "2026-09-07T12:00:00Z",
  updatedAt: "2026-09-07T12:00:00Z",
  finishedAt: "2026-09-07T12:00:00Z",
};
const message = (
  id: number,
  role: sessions.MessageRole,
  content: string,
  extra = {},
) => ({
  id,
  sessionId: 252,
  position: id,
  role,
  content,
  toolName: null,
  toolArgs: null,
  model: null,
  promptTokens: null,
  completionTokens: null,
  createdAt: session.createdAt,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sessions.get).mockResolvedValue(session);
  vi.mocked(sessions.start).mockResolvedValue(session);
  vi.mocked(buildSystem).mockImplementation(
    async (_agent, _dashboard, extra) => `Current instructions\n${extra}`,
  );
  vi.mocked(sessions.messages).mockResolvedValue([
    message(1, "system", "Old automated instructions: no conversation"),
    message(2, "user", "Update the facts"),
    message(
      3,
      "assistant",
      '<|REVISE_FACTS "Corrected the figure" f3 "The figure is 19.69%"|>',
    ),
    message(4, "tool", "Wrote version 9", {
      toolName: "REVISE_FACTS",
      toolArgs: ["Corrected the figure", "f3", "The figure is 19.69%"],
    }),
    message(5, "assistant", "Corrected the figure in f3."),
  ]);
  vi.mocked(sendChat).mockResolvedValue({
    content: "The source gives the precise figure. <|DONE|>",
    usage: { model: "test-model", promptTokens: 100, completionTokens: 12 },
  });
});

describe("continuing an automated session", () => {
  it("keeps its evidence and identity without replaying its mutations", async () => {
    const result = await reply(agent, 252, "Why did you change f3?");
    expect(sessions.start).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    const [model, history] = vi.mocked(sendChat).mock.calls[0]!;
    expect(model).toBe("test-model");
    expect(history.filter((m) => m.role === "system")).toHaveLength(1);
    expect(history[0]!.content).toContain("CONVERSATION MODE");
    expect(history[0]!.content).toContain("Current dashboard context");
    expect(history[0]!.content).not.toContain("Old automated instructions");
    expect(history.some((m) => m.content.includes("Wrote version 9"))).toBe(
      true,
    );
    expect(sessions.append).toHaveBeenCalledWith(252, {
      role: "user",
      content: "Why did you change f3?",
    });
    expect(sessions.finish).toHaveBeenCalledWith(252);
    expect(result.answer).toBe("The source gives the precise figure.");
  });

  it("executes an available tool when the new turn requests it", async () => {
    vi.mocked(sendChat).mockResolvedValueOnce({
      content:
        '<|REVISE_FACTS "Restored the comparison" f3 "Restored comparison"|>',
      usage: { model: "test-model", promptTokens: 100, completionTokens: 12 },
    });
    await reply(agent, 252, "Restore the comparison if supported.");
    expect(write).toHaveBeenCalledExactlyOnceWith(
      ["Restored the comparison", "f3", "Restored comparison"],
      { dashboardId: "d", sessionId: 252 },
    );
  });

  it("records a model failure so the session can be continued again", async () => {
    vi.mocked(sendChat).mockRejectedValueOnce(new Error("model unavailable"));
    await expect(reply(agent, 252, "Explain the change")).rejects.toThrow(
      "model unavailable",
    );
    expect(sessions.fail).toHaveBeenCalledWith(252, "model unavailable");
  });

  it("opens a new chat idle, ready to accept its first queued turn", async () => {
    await startChat(agent, { model: "test-model", dashboardId: "d" });
    expect(sessions.finish).toHaveBeenCalledWith(252);
    expect(sendChat).not.toHaveBeenCalled();
  });
});
