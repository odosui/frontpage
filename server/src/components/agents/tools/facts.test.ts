import { describe, expect, it } from "vitest";
import { parseFacts } from "./facts";
import { parseToolCalls } from "../protocol";

/**
 * The whole list arrives as one flat run of arguments, so what keeps it
 * readable is that no two kinds of token look alike. These pin that down.
 */
describe("parseFacts", () => {
  it("reads an id, its line, its confidence and its source", () => {
    expect(parseFacts(["f3", "warehouses supply drone parts", "4", "9241"])).toEqual([
      {
        id: "f3",
        content: "warehouses supply drone parts",
        confidence: 4,
        articleId: 9241,
      },
    ]);
  });

  it("treats a line with no id in front of it as a new fact", () => {
    expect(parseFacts(["a brand new claim", "2"])).toEqual([
      { content: "a brand new claim", confidence: 2 },
    ]);
  });

  it("keeps several facts apart, ids and all", () => {
    const drafts = parseFacts([
      "f1",
      "the first",
      "5",
      "the second",
      "f7",
      "the third",
      "1",
    ]);
    expect(drafts).toEqual([
      { id: "f1", content: "the first", confidence: 5 },
      { content: "the second" },
      { id: "f7", content: "the third", confidence: 1 },
    ]);
  });

  // the scale stops at 5, so a bigger number can only be an article
  it("tells a confidence from an article id by size", () => {
    expect(parseFacts(["a claim", "5"])[0]).toEqual({
      content: "a claim",
      confidence: 5,
    });
    expect(parseFacts(["a claim", "6"])[0]).toEqual({
      content: "a claim",
      articleId: 6,
    });
  });

  it("drops a number with no fact before it rather than inventing one", () => {
    expect(parseFacts(["3", "a claim"])).toEqual([{ content: "a claim" }]);
  });

  it("survives the call as the model actually writes it", () => {
    const [call] = parseToolCalls(
      '<|REVISE_FACTS "Russian-Ukrainian war" "Reuters added a second source" ' +
        'f3 "**Wildberries** warehouses supply drone components" 4 9241 ' +
        '"The **Kaluga** plant reopened" 2|>',
    );
    expect(call?.name).toBe("REVISE_FACTS");
    expect(call?.args.slice(0, 2)).toEqual([
      "Russian-Ukrainian war",
      "Reuters added a second source",
    ]);
    expect(parseFacts(call!.args.slice(2))).toEqual([
      {
        id: "f3",
        content: "**Wildberries** warehouses supply drone components",
        confidence: 4,
        articleId: 9241,
      },
      { content: "The **Kaluga** plant reopened", confidence: 2 },
    ]);
  });
});
