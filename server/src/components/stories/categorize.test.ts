import { describe, expect, it } from "vitest";
import { parseTree, treeComplaint } from "./categorize";

const TREE = '{"stories":[{"story":"s","articles":[{"id":1,"tags":["a"]}]}]}';

describe("parseTree", () => {
  it("reads the tree out of a fenced, prefaced answer", () => {
    const parsed = parseTree("Here it is:\n```json\n" + TREE + "\n```");

    expect(parsed.stories[0]?.story).toBe("s");
  });

  it("says what came back when there is no object at all", () => {
    expect(() => parseTree("all filed")).toThrow(/no JSON object.*all filed/s);
  });

  it("reports an empty answer as empty", () => {
    expect(() => parseTree("")).toThrow(/\(empty\)/);
  });

  it("rejects an object without a stories array", () => {
    expect(() => parseTree('{"unassigned":[]}')).toThrow(/no stories array/);
  });
});

describe("treeComplaint", () => {
  it("accepts a good tree", () => {
    expect(treeComplaint(TREE)).toBeNull();
  });

  it("asks again, saying what was wrong", () => {
    const complaint = treeComplaint("I filed them all.");

    expect(complaint).toContain("no JSON object");
    expect(complaint).toContain("Nothing has been saved");
  });
});
