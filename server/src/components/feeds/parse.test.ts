import { describe, expect, it } from "vitest";
import { parseFeed } from "./parse";

const FEED_URL = "https://example.com/feed.xml";

describe("parseFeed", () => {
  it("reads rss items", () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <title>Example</title>
        <item>
          <title>First headline</title>
          <link>https://example.com/one</link>
          <description>What happened.</description>
          <pubDate>Wed, 12 Aug 2026 09:30:00 GMT</pubDate>
        </item>
        <item>
          <title><![CDATA[Second & headline]]></title>
          <link>https://example.com/two</link>
        </item>
      </channel></rss>`;

    expect(parseFeed(xml, FEED_URL)).toEqual([
      {
        title: "First headline",
        url: "https://example.com/one",
        image: "",
        description: "What happened.",
        publishedAt: "2026-08-12T09:30:00.000Z",
      },
      {
        title: "Second & headline",
        url: "https://example.com/two",
        image: "",
        description: "",
        publishedAt: null,
      },
    ]);
  });

  it("reads atom entries, taking the link's href", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
      <title>Example</title>
      <entry>
        <title>Atom headline</title>
        <link rel="edit" href="https://example.com/edit"/>
        <link rel="alternate" href="https://example.com/atom-one"/>
        <summary>An atom summary.</summary>
        <published>2026-08-12T09:30:00Z</published>
      </entry>
    </feed>`;

    expect(parseFeed(xml, FEED_URL)).toEqual([
      {
        title: "Atom headline",
        url: "https://example.com/atom-one",
        image: "",
        description: "An atom summary.",
        publishedAt: "2026-08-12T09:30:00.000Z",
      },
    ]);
  });

  it("does not mistake the channel title for an item", () => {
    const xml = `<rss><channel><title>Example</title>
      <link>https://example.com</link>
      <item><title>Only item</title><link>/relative</link></item>
    </channel></rss>`;

    const items = parseFeed(xml, FEED_URL);
    expect(items).toHaveLength(1);
    expect(items[0]!.url).toBe("https://example.com/relative");
  });

  it("falls back to a permalink guid when there is no link", () => {
    const xml = `<rss><channel><item>
      <title>Guid only</title>
      <guid isPermaLink="true">https://example.com/guid</guid>
    </item></channel></rss>`;

    expect(parseFeed(xml, FEED_URL)[0]!.url).toBe("https://example.com/guid");
  });

  it("ignores a guid that is not a permalink", () => {
    const xml = `<rss><channel><item>
      <title>Opaque guid</title>
      <guid isPermaLink="false">tag:example.com,2026:1</guid>
    </item></channel></rss>`;

    expect(parseFeed(xml, FEED_URL)).toEqual([]);
  });

  it("decodes entities in titles", () => {
    const xml = `<rss><channel><item>
      <title>Tech &amp; science &#8212; what&#39;s next</title>
      <link>https://example.com/x</link>
    </item></channel></rss>`;

    expect(parseFeed(xml, FEED_URL)[0]!.title).toBe(
      "Tech & science — what's next",
    );
  });

  it("picks up an image enclosure and media:content", () => {
    const xml = `<rss><channel>
      <item>
        <title>With enclosure</title><link>https://example.com/a</link>
        <enclosure url="https://cdn.example.com/a.jpg" type="image/jpeg"/>
      </item>
      <item>
        <title>With media</title><link>https://example.com/b</link>
        <media:content url="https://cdn.example.com/b.jpg" medium="image"/>
      </item>
      <item>
        <title>With audio</title><link>https://example.com/c</link>
        <enclosure url="https://cdn.example.com/c.mp3" type="audio/mpeg"/>
      </item>
    </channel></rss>`;

    expect(parseFeed(xml, FEED_URL).map((a) => a.image)).toEqual([
      "https://cdn.example.com/a.jpg",
      "https://cdn.example.com/b.jpg",
      "",
    ]);
  });

  it("drops duplicate links and items with no title", () => {
    const xml = `<rss><channel>
      <item><title>Same</title><link>https://example.com/dup</link></item>
      <item><title>Same again</title><link>https://example.com/dup</link></item>
      <item><link>https://example.com/untitled</link></item>
    </channel></rss>`;

    expect(parseFeed(xml, FEED_URL)).toHaveLength(1);
  });

  it("falls back to dc:date and updated for the publish time", () => {
    const xml = `<rss><channel>
      <item><title>Dublin core</title><link>https://example.com/a</link>
        <dc:date>2026-08-12T09:30:00Z</dc:date></item>
      <item><title>Updated only</title><link>https://example.com/b</link>
        <updated>2026-08-13T10:00:00Z</updated></item>
    </channel></rss>`;

    expect(parseFeed(xml, FEED_URL).map((a) => a.publishedAt)).toEqual([
      "2026-08-12T09:30:00.000Z",
      "2026-08-13T10:00:00.000Z",
    ]);
  });

  it("drops a publish date it cannot trust", () => {
    const xml = `<rss><channel>
      <item><title>Garbage</title><link>https://example.com/a</link>
        <pubDate>not a date at all</pubDate></item>
      <item><title>Absurd</title><link>https://example.com/b</link>
        <pubDate>Mon, 01 Jan 1200 00:00:00 GMT</pubDate></item>
    </channel></rss>`;

    expect(parseFeed(xml, FEED_URL).map((a) => a.publishedAt)).toEqual([
      null,
      null,
    ]);
  });

  it("strips markup out of a description", () => {
    const xml = `<rss><channel><item>
      <title>Marked up</title><link>https://example.com/a</link>
      <description><![CDATA[<p>A <b>bold</b> claim.</p>
        <img src="https://tracker.example.com/p.gif">]]></description>
    </item></channel></rss>`;

    expect(parseFeed(xml, FEED_URL)[0]!.description).toBe("A bold claim.");
  });

  it("falls back to the body when the description is empty", () => {
    const xml = `<rss><channel><item>
      <title>Empty summary</title><link>https://example.com/a</link>
      <description><![CDATA[]]></description>
      <content:encoded><![CDATA[<p>The body opens like this.</p>]]></content:encoded>
    </item></channel></rss>`;

    expect(parseFeed(xml, FEED_URL)[0]!.description).toBe(
      "The body opens like this.",
    );
  });

  it("prefers a real description over the body", () => {
    const xml = `<rss><channel><item>
      <title>Both</title><link>https://example.com/a</link>
      <description>The written summary.</description>
      <content:encoded><![CDATA[<p>The whole article.</p>]]></content:encoded>
    </item></channel></rss>`;

    expect(parseFeed(xml, FEED_URL)[0]!.description).toBe(
      "The written summary.",
    );
  });

  it("caps a description that carries the whole article", () => {
    const body = "word ".repeat(500);
    const xml = `<rss><channel><item>
      <title>Full text</title><link>https://example.com/a</link>
      <description>${body}</description>
    </item></channel></rss>`;

    const description = parseFeed(xml, FEED_URL)[0]!.description!;
    expect(description.length).toBeLessThanOrEqual(1001);
    expect(description.endsWith("…")).toBe(true);
    expect(description).not.toContain("wor…");
  });

  it("returns nothing for a document that is not a feed", () => {
    expect(parseFeed("<html><body>not a feed</body></html>", FEED_URL)).toEqual(
      [],
    );
  });
});
