import { describe, expect, it } from "vitest";
import { UnreadableError, extractReadable } from "./readable";
import { htmlToText } from "../../utils/html";

const BODY = Array.from(
  { length: 8 },
  (_, i) =>
    `<p>Paragraph ${i} of a story about something that happened somewhere, ` +
    `written at enough length that the scorer treats it as prose rather ` +
    `than as a caption or a piece of navigation.</p>`,
).join("");

const page = (body: string) => `<!doctype html>
<html><head><title>A headline</title></head><body>
  <nav><a href="/">Home</a><a href="/world">World</a></nav>
  <article>${body}</article>
  <footer>© Someone</footer>
</body></html>`;

describe("htmlToText", () => {
  it("keeps paragraph breaks and closes up inline tags", () => {
    expect(htmlToText("<p>One <em>two</em> three</p><p>Second</p>")).toBe(
      "One two three\n\nSecond",
    );
  });

  it("decodes entities", () => {
    expect(htmlToText("<p>Salt &amp; pepper &#8212; yes</p>")).toBe(
      "Salt & pepper — yes",
    );
  });

  it("collapses runs of blank lines", () => {
    expect(htmlToText("<div><p>a</p></div><div><div><p>b</p></div></div>")).toBe(
      "a\n\nb",
    );
  });
});

describe("extractReadable", () => {
  it("returns the article body without the furniture around it", () => {
    const article = extractReadable(page(BODY), "https://example.com/a");

    expect(article.text).toContain("Paragraph 0 of a story");
    expect(article.text).toContain("Paragraph 7 of a story");
    expect(article.text).not.toContain("Home");
    expect(article.text).not.toContain("© Someone");
    // eight paragraphs, so seven breaks between them
    expect(article.text.split("\n\n")).toHaveLength(8);
  });

  it("reads the byline and publish time when the page carries them", () => {
    const html = page(BODY).replace(
      "</head>",
      `<meta name="author" content="A Reporter">
       <meta property="article:published_time" content="2026-08-15T10:00:00Z">
       </head>`,
    );
    const article = extractReadable(html, "https://example.com/a");

    expect(article.byline).toBe("A Reporter");
    expect(article.publishedAt).toBe("2026-08-15T10:00:00.000Z");
  });

  it("drops a publish date that cannot be believed", () => {
    const html = page(BODY).replace(
      "</head>",
      `<meta property="article:published_time" content="1409-01-01T00:00:00Z">
       </head>`,
    );
    expect(extractReadable(html, "https://example.com/a").publishedAt).toBeNull();
  });

  it("refuses a page that is all navigation", () => {
    const html = `<!doctype html><html><body>
      <nav><a href="/a">One</a><a href="/b">Two</a><a href="/c">Three</a></nav>
      <p>Section index</p>
    </body></html>`;

    expect(() => extractReadable(html, "https://example.com/section")).toThrow(
      UnreadableError,
    );
  });

  /**
   * The case a plain length check gets wrong: a section index whose headline
   * list has been stripped still leaves a blurb and a column of footer links,
   * which together clear any sane character count.
   */
  it("refuses a section index that is long but not prose", () => {
    const links = Array.from(
      { length: 40 },
      (_, i) => `<li><a href="/x${i}">A footer link</a></li>`,
    ).join("");
    const html = `<!doctype html><html><body><div>
      <p>We have been separating the signal from the noise for 25 years, and
      are the trusted source in a sea of information.</p>
      <ul>${links}</ul>
    </div></body></html>`;

    expect(() => extractReadable(html, "https://example.com/section")).toThrow(
      /characters of prose/,
    );
  });

  it("refuses a javascript shell with no text in it", () => {
    const html = `<!doctype html><html><body><div id="root"></div>
      <script>renderTheWholeApp()</script></body></html>`;

    expect(() => extractReadable(html, "https://example.com/a")).toThrow(
      UnreadableError,
    );
  });
});
