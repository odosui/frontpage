import { describe, expect, it } from "vitest";
import { hashPassword, normalizeEmail, verifyPassword } from "./users";

describe("passwords", () => {
  it("verifies the password it was made from", () => {
    const stored = hashPassword("correct horse battery");
    expect(verifyPassword("correct horse battery", stored)).toBe(true);
    expect(verifyPassword("correct horse batter", stored)).toBe(false);
  });

  it("salts, so the same password hashes differently every time", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  it("refuses a hash it cannot read", () => {
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "bcrypt$1$aa$bb")).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("is the reason a login is case-insensitive", () => {
    expect(normalizeEmail("  Me@Example.COM ")).toBe("me@example.com");
  });
});
