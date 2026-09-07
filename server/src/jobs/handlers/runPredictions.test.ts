import { beforeEach, describe, expect, it, vi } from "vitest";
import { runPredictionsHandler } from "./runPredictions";
import { runAgent } from "../../components/agents/runtime/runner";
import { predictionsAgent } from "../../components/agents/definitions/predictions";
import * as dashboards from "../../models/dashboards";
import * as facts from "../../models/facts";
import * as predictions from "../../models/predictions";
import { attachSession } from "../queue";
import { HandlerContext } from "../types";

vi.mock("../../components/agents/runtime/runner", () => ({
  runAgent: vi.fn(),
}));
vi.mock("../../components/ai/models", () => ({
  bigModel: vi.fn(async () => "test-model"),
}));
vi.mock("../../models/dashboards", () => ({ get: vi.fn() }));
vi.mock("../../models/facts", () => ({ forDashboard: vi.fn() }));
vi.mock("../../models/predictions", async (original) => ({
  ...(await original<typeof import("../../models/predictions")>()),
  forDashboard: vi.fn(),
}));
vi.mock("../queue", () => ({ attachSession: vi.fn() }));

const ctx = { job: { id: "42" }, log: vi.fn() } as unknown as HandlerContext;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dashboards.get).mockResolvedValue({
    id: "d",
    name: "Energy",
  } as never);
  vi.mocked(facts.forDashboard).mockResolvedValue([
    { id: "f1", content: "Terminal exports have stopped" },
  ] as never);
  vi.mocked(predictions.forDashboard).mockResolvedValue([
    {
      id: 7,
      content: "Exports resume this month",
      likelihood: null,
      forecasts: [],
    },
    {
      id: 8,
      content: "Fuel prices rise",
      likelihood: 4,
      forecasts: [{ reasoning: "f1 constrains supply" }],
    },
  ] as never);
  vi.mocked(runAgent).mockResolvedValue({
    sessionId: 12,
    steps: 3,
    exhausted: false,
    promptTokens: 100,
    completionTokens: 20,
    elapsedMs: 50,
    answer: "Forecasted claim 7",
  });
});

describe("prediction runs", () => {
  it("forecasts supplied claims with their prior reasoning and exposes the session", async () => {
    const result = await runPredictionsHandler({ dashboardId: "d" }, ctx);
    const [agent, options] = vi.mocked(runAgent).mock.calls[0]!;
    expect(agent).toBe(predictionsAgent);
    expect(agent.tools.map((tool) => tool.name)).toEqual([
      "GET_FACTS",
      "FORECAST",
    ]);
    expect(options.dashboardId).toBe("d");
    expect(options.task).toContain("GET_FACTS");
    expect(options.task).toContain(
      "#7 [not yet forecast] Exports resume this month",
    );
    expect(options.task).toContain("#8 [4/5 likely] Fuel prices rise");
    expect(options.task).toContain("f1 constrains supply");
    await options.onSession!(12);
    expect(attachSession).toHaveBeenCalledWith("42", 12);
    expect(result?.result?.sessionId).toBe(12);
  });

  it("does not call the model without established facts", async () => {
    vi.mocked(facts.forDashboard).mockResolvedValue([]);
    const result = await runPredictionsHandler({ dashboardId: "d" }, ctx);
    expect(result?.result).toMatchObject({ skipped: true, facts: 0 });
    expect(runAgent).not.toHaveBeenCalled();
  });

  it("does not call the model without predictions to forecast", async () => {
    vi.mocked(predictions.forDashboard).mockResolvedValue([]);
    const result = await runPredictionsHandler({ dashboardId: "d" }, ctx);
    expect(result?.result).toMatchObject({ skipped: true, predictions: 0 });
    expect(runAgent).not.toHaveBeenCalled();
  });

  it("rejects a dashboard that no longer exists", async () => {
    vi.mocked(dashboards.get).mockResolvedValue(null);
    await expect(
      runPredictionsHandler({ dashboardId: "gone" }, ctx),
    ).rejects.toThrow("no longer exists");
    expect(runAgent).not.toHaveBeenCalled();
  });
});
