import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("flattens case, spacing and punctuation to one key", () => {
    expect(slugify("US election")).toBe("us-election");
    expect(slugify("U.S. Election")).toBe("us-election");
    expect(slugify("  us   election  ")).toBe("us-election");
  });

  it("strips accents rather than dropping the letter", () => {
    expect(slugify("Zelensky's café")).toBe("zelenskys-cafe");
  });

  it("returns empty for text with nothing url-safe in it", () => {
    expect(slugify("!!!")).toBe("");
  });
});
