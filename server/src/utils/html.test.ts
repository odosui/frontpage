import { describe, expect, it } from "vitest";
import { decodeEntities, htmlToText } from "./html";

describe("decodeEntities", () => {
  it("decodes the xml five", () => {
    expect(decodeEntities("a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;")).toBe(
      `a & b <c> "d" 'e'`,
    );
  });

  it("decodes the typography publishers write with", () => {
    expect(decodeEntities("&laquo;цитата&raquo;&nbsp;&mdash; РБК&hellip;")).toBe(
      "«цитата» — РБК…",
    );
  });

  it("tells &Prime; from &prime;", () => {
    expect(decodeEntities("&prime;&Prime;")).toBe("′″");
  });

  it("decodes numeric references, decimal and hex", () => {
    expect(decodeEntities("&#8212;&#x2014;")).toBe("——");
  });

  it("leaves a name it does not know alone", () => {
    expect(decodeEntities("&notanentity; &amp;")).toBe("&notanentity; &");
  });
});

describe("htmlToText", () => {
  it("keeps paragraphs apart and closes up inline tags", () => {
    expect(htmlToText("<p>One <em>emphatic</em> line.</p><p>Two.</p>")).toBe(
      "One emphatic line.\n\nTwo.",
    );
  });

  it("drops scripts, styles and comments", () => {
    const html = "<p>Text.</p><script>bad()</script><style>p{}</style><!-- hi -->";
    expect(htmlToText(html)).toBe("Text.");
  });
});
