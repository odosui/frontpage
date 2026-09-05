import { describe, expect, it } from "vitest";
import { parseEdits } from "./facts";
import { parseToolCalls } from "../protocol";

/**
 * The changes arrive as one flat run of arguments, so what keeps them readable
 * is that no two kinds of token look alike. These pin that down.
 */
describe("parseEdits", () => {
  it("reads a change to a fact: its line, its confidence and its source", () => {
    expect(
      parseEdits(["f3", "warehouses supply drone parts", "4", "9241"]),
    ).toEqual([
      {
        op: "set",
        id: "f3",
        content: "warehouses supply drone parts",
        confidence: 4,
        articleIds: [9241],
      },
    ]);
  });

  it("changes only what is given — an id and a number is a confidence alone", () => {
    expect(parseEdits(["f3", "4"])).toEqual([
      { op: "set", id: "f3", confidence: 4 },
    ]);
  });

  it("hangs every article id in a row on the change before them", () => {
    expect(parseEdits(["f3", "corroborated now", "4", "9241", "9310"])).toEqual([
      {
        op: "set",
        id: "f3",
        content: "corroborated now",
        confidence: 4,
        articleIds: [9241, 9310],
      },
    ]);
  });

  it("treats a line with no id in front of it as a new fact", () => {
    expect(parseEdits(["a brand new claim", "2"])).toEqual([
      { op: "add", content: "a brand new claim", confidence: 2 },
    ]);
  });

  it("reads a minus in front of an id as a deletion", () => {
    expect(parseEdits(["-f8"])).toEqual([{ op: "drop", id: "f8" }]);
  });

  it("takes nothing else onto a deletion", () => {
    expect(parseEdits(["-f8", "4", "a new claim"])).toEqual([
      { op: "drop", id: "f8" },
      { op: "add", content: "a new claim" },
    ]);
  });

  it("keeps several changes apart, ids and all", () => {
    const edits = parseEdits([
      "f1",
      "the first, reworded",
      "5",
      "the second, brand new",
      "-f7",
      "f9",
      "1",
    ]);
    expect(edits).toEqual([
      { op: "set", id: "f1", content: "the first, reworded", confidence: 5 },
      { op: "add", content: "the second, brand new" },
      { op: "drop", id: "f7" },
      { op: "set", id: "f9", confidence: 1 },
    ]);
  });

  // the scale stops at 5, so a bigger number can only be an article
  it("tells a confidence from an article id by size", () => {
    expect(parseEdits(["a claim", "5"])[0]).toEqual({
      op: "add",
      content: "a claim",
      confidence: 5,
    });
    expect(parseEdits(["a claim", "6"])[0]).toEqual({
      op: "add",
      content: "a claim",
      articleIds: [6],
    });
  });

  it("drops a number with no change before it rather than inventing one", () => {
    expect(parseEdits(["3", "a claim"])).toEqual([
      { op: "add", content: "a claim" },
    ]);
  });

  it("survives the call as the model actually writes it", () => {
    const [call] = parseToolCalls(
      '<|REVISE_FACTS "Reuters added a second source" ' +
        'f3 "**Wildberries** warehouses supply drone components" 4 9241 ' +
        '"The **Kaluga** plant reopened" 2 -f8|>',
    );
    expect(call?.name).toBe("REVISE_FACTS");
    expect(call?.args[0]).toBe("Reuters added a second source");
    expect(parseEdits(call!.args.slice(1))).toEqual([
      {
        op: "set",
        id: "f3",
        content: "**Wildberries** warehouses supply drone components",
        confidence: 4,
        articleIds: [9241],
      },
      { op: "add", content: "The **Kaluga** plant reopened", confidence: 2 },
      { op: "drop", id: "f8" },
    ]);
  });
});
