import { beforeAll, describe, expect, it } from "vitest";
import {
  SESSION_TTL_MS,
  createToken,
  parseCookies,
  readToken,
  sessionCookie,
  clearedCookie,
} from "./session";

beforeAll(() => {
  process.env.FRONTPAGE_SECRET = "a-test-secret-long-enough";
});

describe("tokens", () => {
  it("round-trips the user it was signed for", () => {
    expect(readToken(createToken(42))).toBe(42);
  });

  it("rejects a tampered payload", () => {
    const token = createToken(42);
    expect(readToken(token.replace(/^42\./, "43."))).toBeNull();
  });

  it("rejects a token past its expiry", () => {
    const token = createToken(42);
    expect(readToken(token, Date.now() + SESSION_TTL_MS + 1000)).toBeNull();
  });

  it("rejects nonsense", () => {
    expect(readToken("")).toBeNull();
    expect(readToken("nope")).toBeNull();
    expect(readToken("1.2.3")).toBeNull();
  });
});

describe("cookies", () => {
  it("reads a cookie header", () => {
    expect(parseCookies("a=1; fp_session=abc.def; b=2")).toMatchObject({
      a: "1",
      fp_session: "abc.def",
      b: "2",
    });
    expect(parseCookies(undefined)).toEqual({});
  });

  it("keeps the session cookie off javascript, and off http in production", () => {
    const set = sessionCookie("token", true);
    expect(set).toContain("HttpOnly");
    expect(set).toContain("SameSite=Lax");
    expect(set).toContain("Secure");
    expect(sessionCookie("token", false)).not.toContain("Secure");
  });

  it("expires the cookie on logout", () => {
    expect(clearedCookie(false)).toContain("Max-Age=0");
  });
});
