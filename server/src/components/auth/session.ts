import crypto from "crypto";

/**
 * A session is a signed cookie and nothing else — no table, no store to expire.
 * The token says who and until when, and the signature is what makes it true:
 *
 *   <userId>.<expiry ms>.<hmac>
 *
 * Logging out drops the cookie. There is no server-side revocation; changing
 * FRONTPAGE_SECRET invalidates every token at once, which is the blunt version
 * of it and enough for an instance with a handful of accounts.
 */
export const SESSION_COOKIE = "fp_session";

/** A month. Long enough that a reader is not asked again for no reason. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const DEV_SECRET = "frontpage-development-secret";

let cached: string | undefined;

export function sessionSecret(): string {
  if (cached) return cached;
  const secret = process.env.FRONTPAGE_SECRET;
  if (secret && secret.length >= 16) {
    cached = secret;
    return cached;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FRONTPAGE_SECRET must be set to at least 16 characters in production",
    );
  }
  if (secret) {
    console.warn("[auth] FRONTPAGE_SECRET is too short; using the dev secret");
  }
  cached = DEV_SECRET;
  return cached;
}

const sign = (payload: string) =>
  crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");

export function createToken(userId: number, now = Date.now()): string {
  const payload = `${userId}.${now + SESSION_TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

/** The user the token stands for, or null if it is forged, stale or malformed. */
export function readToken(token: string, now = Date.now()): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [rawId, rawExpiry, signature] = parts as [string, string, string];

  const expected = Buffer.from(sign(`${rawId}.${rawExpiry}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length) return null;
  if (!crypto.timingSafeEqual(expected, given)) return null;

  const expiry = Number(rawExpiry);
  if (!Number.isFinite(expiry) || expiry <= now) return null;

  const userId = Number(rawId);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

// ===============
// COOKIES
// ===============

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at === -1) continue;
    const name = part.slice(0, at).trim();
    if (name) out[name] = decodeURIComponent(part.slice(at + 1).trim());
  }
  return out;
}

export function sessionCookie(token: string, secure: boolean): string {
  return cookie(token, SESSION_TTL_MS / 1000, secure);
}

/** The same cookie, emptied and already expired: what logging out sends. */
export function clearedCookie(secure: boolean): string {
  return cookie("", 0, secure);
}

function cookie(value: string, maxAge: number, secure: boolean) {
  const attrs = [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}
