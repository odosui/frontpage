import { describe, expect, it } from "vitest";
import { outermostObject } from "./jsonObject";

describe("outermostObject", () => {
  it("takes the object out of the prose around it", () => {
    expect(outermostObject('here you go:\n{"a":1}\nhope that helps')).toBe(
      '{"a":1}',
    );
  });

  it("keeps nested objects whole", () => {
    expect(outermostObject('{"a":{"b":2}}')).toBe('{"a":{"b":2}}');
  });

  it("stops at the matching brace rather than the last one", () => {
    expect(outermostObject('{"a":1}\nps: {"b":2}')).toBe('{"a":1}');
  });

  it("ignores braces inside strings", () => {
    expect(outermostObject('{"a":"}"}')).toBe('{"a":"}"}');
  });

  it("ignores a brace after an escaped quote", () => {
    expect(outermostObject('{"a":"say \\"}\\""}')).toBe('{"a":"say \\"}\\""}');
  });

  it("finds nothing in an answer that was cut off mid-object", () => {
    expect(outermostObject('{"stories":[{"story":"Attack on')).toBeNull();
  });

  it("finds nothing in prose", () => {
    expect(outermostObject("I have filed them all.")).toBeNull();
  });
});
