import { beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueAgentReply } from "./queue";
import { withTransaction } from "../db/pool";

vi.mock("../db/pool", () => ({ query: vi.fn(), withTransaction: vi.fn() }));
const query = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(withTransaction).mockImplementation(async (fn) =>
    fn({ query } as never),
  );
});

describe("queueing a conversation turn", () => {
  it("refuses a conversation that is already running without enqueueing", async () => {
    query.mockResolvedValueOnce({ rows: [{ status: "running" }] });
    expect(await enqueueAgentReply(252, "Why?")).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]![0]).toContain("for update");
  });

  it("refuses a still-active job even after the session has finished", async () => {
    query.mockResolvedValueOnce({ rows: [{ status: "finished" }] });
    query.mockResolvedValueOnce({ rows: [{ exists: 1 }] });
    expect(await enqueueAgentReply(252, "Why?")).toBeNull();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("reserves an idle session and queues exactly one non-retrying turn in the transaction", async () => {
    const now = new Date();
    query.mockResolvedValueOnce({ rows: [{ status: "finished" }] });
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({
      rows: [
        {
          id: "9",
          type: "agent_reply",
          status: "queued",
          payload: { sessionId: 252, question: "Why?" },
          result: null,
          error: null,
          attempts: 0,
          max_attempts: 1,
          run_at: now,
          started_at: null,
          finished_at: null,
          created_at: now,
          updated_at: now,
        },
      ],
    });
    query.mockResolvedValueOnce({ rows: [] });
    const job = await enqueueAgentReply(252, "Why?");
    expect(job?.payload).toEqual({ sessionId: 252, question: "Why?" });
    expect(job?.maxAttempts).toBe(1);
    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[3]![0]).toContain("status = 'running'");
  });

  it("propagates enqueue failures to the transaction instead of reserving the session", async () => {
    query.mockResolvedValueOnce({ rows: [{ status: "finished" }] });
    query.mockResolvedValueOnce({ rows: [] });
    query.mockRejectedValueOnce(new Error("insert failed"));
    await expect(enqueueAgentReply(252, "Why?")).rejects.toThrow(
      "insert failed",
    );
    expect(query).toHaveBeenCalledTimes(3);
  });
});
