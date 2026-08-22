import { describe, expect, it } from "vitest";
import { parseToolCalls } from "./protocol";

describe("parseToolCalls", () => {
  it("reads a call and its quoted arguments", () => {
    const calls = parseToolCalls('<|GET_STORIES "united states" 10|>');

    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe("GET_STORIES");
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
      '<|GET_STORIES "kyiv"|> <|GET_STORIES "moscow"|>',
    );

    expect(calls.map((c) => c.args[0])).toEqual(["kyiv", "moscow"]);
  });

  // the failure this guards against wrote one fact per word: the escape closed
  // the string early and the rest of the sentence arrived as bare tokens
  it("keeps a quoted argument whole across an escaped quote", () => {
    const calls = parseToolCalls(
      '<|REVISE_FACTS "why" f1 "a claim about \\"the west\\" and its future" 3|>',
    );
    expect(calls[0]!.args).toEqual([
      "why",
      "f1",
      'a claim about "the west" and its future',
      "3",
    ]);
  });

  it("unescapes a backslash inside a quoted argument", () => {
    const calls = parseToolCalls('<|GET_STORIES "a\\\\b"|>');
    expect(calls[0]!.args).toEqual(["a\\b"]);
  });

  it("leaves a backslash in a bare argument as typed", () => {
    const calls = parseToolCalls("<|GET_STORIES a\\b|>");
    expect(calls[0]!.args).toEqual(["a\\b"]);
  });

  it("finds nothing in a message that only talks about calls", () => {
    expect(parseToolCalls("I could call GET_STORY next.")).toEqual([]);
  });
});
