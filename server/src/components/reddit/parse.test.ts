import { describe, expect, it } from "vitest";
import { RedditPost, subredditOf, toArticles } from "./parse";

const post = (over: Partial<RedditPost> = {}): RedditPost => ({
  title: "A post",
  score: 100,
  is_self: false,
  url: "https://nature.com/articles/x",
  permalink: "/r/futurology/comments/abc/a_post/",
  created_utc: 1_770_000_000,
  ...over,
});

describe("toArticles", () => {
  it("stores a link post as the article it points at, not the thread", () => {
    const [a] = toArticles([post()], 20);
    expect(a?.url).toBe("https://nature.com/articles/x");
    expect(a?.publisher).toBe("nature.com");
    expect(a?.viaUrl).toBe(
      "https://www.reddit.com/r/futurology/comments/abc/a_post/",
    );
  });

  // the whole point of the source: a bar the reader sets, per subreddit
  it("keeps only what cleared the score", () => {
    const posts = [post({ score: 19 }), post({ score: 20 }), post({ score: 21 })];
    expect(toArticles(posts, 20).map((a) => a.score)).toEqual([20, 21]);
    expect(toArticles(posts, 100)).toEqual([]);
  });

  it("keeps a self post as a reddit article, with its text as the summary", () => {
    const [a] = toArticles(
      [
        post({
          is_self: true,
          url: "https://www.reddit.com/r/futurology/comments/abc/a_post/",
          selftext: "what would it take",
        }),
      ],
      20,
    );
    expect(a?.url).toBe(
      "https://www.reddit.com/r/futurology/comments/abc/a_post/",
    );
    // nothing off reddit published it, so there is no publisher to name
    expect(a?.publisher).toBeNull();
    expect(a?.description).toBe("what would it take");
  });

  // a "link" post pointing back at reddit is a crosspost, not a destination
  it("treats an on-reddit link as a discussion", () => {
    const [a] = toArticles(
      [post({ url: "https://www.reddit.com/r/science/comments/zzz/x/" })],
      20,
    );
    expect(a?.publisher).toBeNull();
    expect(a?.url).toBe(
      "https://www.reddit.com/r/futurology/comments/abc/a_post/",
    );
  });

  it("drops furniture and removed posts however well they scored", () => {
    expect(toArticles([post({ stickied: true, score: 9000 })], 20)).toEqual([]);
    expect(
      toArticles([post({ removed_by_category: "moderator", score: 9000 })], 20),
    ).toEqual([]);
    expect(toArticles([post({ over_18: true, score: 9000 })], 20)).toEqual([]);
  });

  it("dates the article when reddit says it was posted", () => {
    const [a] = toArticles([post({ created_utc: 1_770_000_000 })], 20);
    expect(a?.publishedAt).toBe(new Date(1_770_000_000_000).toISOString());
  });
});

describe("subredditOf", () => {
  it("takes the sub out of whatever the reader typed", () => {
    for (const input of [
      "futurology",
      "r/futurology",
      "/r/futurology",
      "https://www.reddit.com/r/futurology",
      "https://old.reddit.com/r/futurology/new/",
    ]) {
      expect(subredditOf(input)).toBe("futurology");
    }
  });
});
