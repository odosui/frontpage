import { RedditAuthError, USER_AGENT, accessToken, forgetToken } from "./auth";
import { RedditPost, parseListing } from "./parse";

const API = "https://oauth.reddit.com";

/** One page is the most reddit will give, and about three days of a busy sub. */
export const MAX_LIMIT = 100;

/**
 * The subreddit's newest posts.
 *
 * `new` rather than `hot` or `top`: the reader asked for the latest things that
 * have been voted up, and the score filter is applied after the fetch. A post
 * submitted a minute ago sits at zero and is skipped — and picked up by a later
 * poll once it has crossed the bar, because articles dedupe on their url. So
 * the bar is a bar, not a race.
 */
export async function fetchSubreddit(
  subreddit: string,
  limit = MAX_LIMIT,
): Promise<RedditPost[]> {
  const url = `${API}/r/${encodeURIComponent(subreddit)}/new?limit=${Math.min(
    limit,
    MAX_LIMIT,
  )}&raw_json=1`;

  let response = await request(url, await accessToken());

  // A token reddit no longer likes — revoked, or rotated under us. Worth
  // exactly one retry with a fresh one; a second 401 is a real problem.
  if (response.status === 401) {
    forgetToken();
    response = await request(url, await accessToken());
  }

  if (response.status === 403) {
    throw new Error(
      `reddit refused r/${subreddit} — it may be private, quarantined or banned`,
    );
  }
  if (response.status === 404) {
    throw new Error(`no subreddit r/${subreddit}`);
  }
  if (response.status === 429) {
    throw new Error("reddit rate-limited us; the next run will retry");
  }
  if (!response.ok) {
    throw new Error(
      `reddit returned ${response.status} ${response.statusText} for r/${subreddit}`,
    );
  }

  return parseListing(await response.json());
}

function request(url: string, token: string) {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": USER_AGENT,
    },
  });
}

export { RedditAuthError };
