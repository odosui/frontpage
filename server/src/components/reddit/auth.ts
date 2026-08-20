/**
 * App-only OAuth against Reddit.
 *
 * The public `.json` endpoints answer 403 to everything now, whatever
 * User-Agent you send, and the RSS feed — which does still work — carries no
 * score, so it cannot answer "what got 20 points". That leaves OAuth as the
 * only way to read a subreddit programmatically.
 *
 * `client_credentials` is the app-only grant: it authenticates the app, not a
 * user, which is all a reader of public subreddits needs. Register a "script"
 * app at https://www.reddit.com/prefs/apps and set the two env vars.
 */
const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";

/**
 * Reddit asks for a descriptive agent and rate-limits generic ones harder.
 * Overridable, since the polite form names a contact.
 */
export const USER_AGENT =
  process.env.REDDIT_USER_AGENT || "frontpage/1.2 (news aggregator)";

/** Tokens last an hour; renewed a minute early so none is used as it expires. */
const EARLY_MS = 60_000;

let cached: { token: string; expiresAt: number } | null = null;
/** Concurrent fetches share one renewal rather than each asking for a token. */
let pending: Promise<string> | null = null;

export class RedditAuthError extends Error {}

export function hasCredentials(): boolean {
  return Boolean(
    process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET,
  );
}

/** A bearer token, from cache when there is a live one. */
export async function accessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.token;
  if (pending) return pending;

  pending = requestToken().finally(() => {
    pending = null;
  });
  return pending;
}

async function requestToken(): Promise<string> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) {
    throw new RedditAuthError(
      "reddit sources need REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET — " +
        "register a script app at https://www.reddit.com/prefs/apps",
    );
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: "grant_type=client_credentials",
  });

  if (response.status === 401) {
    throw new RedditAuthError(
      "reddit rejected the client id/secret — check REDDIT_CLIENT_ID and " +
        "REDDIT_CLIENT_SECRET, and that the app is of type 'script'",
    );
  }
  if (!response.ok) {
    throw new RedditAuthError(
      `reddit token request failed: ${response.status} ${response.statusText}`,
    );
  }

  const body = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!body.access_token) {
    throw new RedditAuthError("reddit returned no access token");
  }

  cached = {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 - EARLY_MS,
  };
  return cached.token;
}

/** Drops the cached token, so the next call asks for a fresh one. */
export function forgetToken() {
  cached = null;
}
