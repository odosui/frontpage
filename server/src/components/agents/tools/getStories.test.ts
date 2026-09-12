import { describe, expect, it } from "vitest";
import { parseArgs } from "./getStories";

/**
 * One tool now does what GET_STORIES and GREP_STORIES did, so the term and the
 * row cap have to be told apart by shape. These pin that down.
 */
describe("GET_STORIES arguments", () => {
  it("lists with no arguments at all", () => {
    expect(parseArgs([])).toEqual({ term: "", limit: 100 });
  });

  it("reads a bare number as the row cap, the way the old list tool took it", () => {
    expect(parseArgs(["20"])).toEqual({ term: "", limit: 20 });
  });

  it("reads anything else as the term, the way the old grep took it", () => {
    expect(parseArgs(["novorossiysk"])).toEqual({
      term: "novorossiysk",
      limit: 100,
    });
  });

  it("takes both, in either order", () => {
    expect(parseArgs(["novorossiysk", "200"])).toEqual({
      term: "novorossiysk",
      limit: 100,
    });
    expect(parseArgs(["200", "novorossiysk"])).toEqual({
      term: "novorossiysk",
      limit: 100,
    });
  });

  // a runaway count would otherwise dump the whole table into the turn. The
  // default is now the cap as well, so this pins the clamp, not a distinct
  // number: a bare listing and a request for 100000 both come back at 100.
  it("caps the rows however big a number it is given", () => {
    expect(parseArgs(["100000"]).limit).toBe(100);
  });

  it("ignores a second term rather than searching for both", () => {
    expect(parseArgs(["kyiv", "moscow"]).term).toBe("kyiv");
  });
});
