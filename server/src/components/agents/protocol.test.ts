import { describe, expect, it } from "vitest";
import { parseToolCalls } from "./protocol";

describe("parseToolCalls", () => {
  it("reads a call and its quoted arguments", () => {
    const calls = parseToolCalls('<|GREP_STORIES "united states" 10|>');

    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe("GREP_STORIES");
    expect(calls[0]!.args).toEqual(["united states", "10"]);
  });

  it("reads several calls from one message", () => {
    const calls = parseToolCalls(
      'looking now\n<|GET_TAGS|>\n<|GET_STORY "Attack on Novorossiysk"|>',
    );

    expect(calls.map((c) => c.name)).toEqual(["GET_TAGS", "GET_STORY"]);
  });

  it("collapses a call the model wrote twice", () => {
    const calls = parseToolCalls(
      '<|GET_STORY "Wildberries fire"|>\n' +
        'I need the result of <|GET_STORY "Wildberries fire"|> to answer.',
    );

    expect(calls).toHaveLength(1);
  });

  it("keeps the same tool called with different arguments", () => {
    const calls = parseToolCalls(
      '<|GREP_STORIES "kyiv"|> <|GREP_STORIES "moscow"|>',
    );

    expect(calls.map((c) => c.args[0])).toEqual(["kyiv", "moscow"]);
  });

  it("finds nothing in a message that only talks about calls", () => {
    expect(parseToolCalls("I could call GET_STORY next.")).toEqual([]);
  });
});
