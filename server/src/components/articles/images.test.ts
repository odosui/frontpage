import { describe, expect, it } from "vitest";
import { extractImages } from "./images";

const BASE = "https://example.com/news/2026/a-story";

describe("extractImages", () => {
  it("makes a relative path absolute against the article", () => {
    const images = extractImages(`<img src="photo@2x.png?t=1">`, BASE);

    expect(images).toEqual([
      {
        url: "https://example.com/news/2026/photo@2x.png?t=1",
        alt: null,
        caption: null,
      },
    ]);
  });

  /** One photo, six <source> variants — the shape Meduza serves. */
  it("collapses a picture's sources into one image, widest first", () => {
    const images = extractImages(
      `<picture>
         <source type="image/webp" media="(min-width: 650px)" srcset="/wide.webp">
         <source type="image/png" media="(min-width: 0)" srcset="/narrow.png">
         <img src="/fallback.png" alt="A photograph">
       </picture>`,
      BASE,
    );

    expect(images).toHaveLength(1);
    expect(images[0]?.alt).toBe("A photograph");
  });

  it("picks the largest candidate out of a width srcset", () => {
    const images = extractImages(
      `<img srcset="/small.jpg 240w, /huge.jpg 1536w, /medium.jpg 640w"
            src="/placeholder-grey.png">`,
      BASE,
    );

    expect(images[0]?.url).toBe("https://example.com/huge.jpg");
  });

  it("prefers a density descriptor's larger variant", () => {
    const images = extractImages(`<img srcset="/one.jpg 1x, /two.jpg 2x">`, BASE);

    expect(images[0]?.url).toBe("https://example.com/two.jpg");
  });

  it("skips lazy-loading placeholders, even in src", () => {
    const images = extractImages(
      `<img src="https://cdn.example.com/grey-placeholder.png">
       <img src="/spacer.gif">
       <img src="/real.jpg">`,
      BASE,
    );

    expect(images.map((i) => i.url)).toEqual(["https://example.com/real.jpg"]);
  });

  it("skips inline glyphs by their declared size", () => {
    const images = extractImages(
      `<img src="/logo.png" width="24" height="24">
       <img src="/figure.png" width="835" height="725">`,
      BASE,
    );

    expect(images.map((i) => i.url)).toEqual([
      "https://example.com/figure.png",
    ]);
  });

  it("never stores an inline image's bytes", () => {
    const images = extractImages(
      `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==">`,
      BASE,
    );

    expect(images).toEqual([]);
  });

  it("reads a figcaption as the caption", () => {
    const images = extractImages(
      `<figure>
         <img src="/nerd_font.png" alt="A terminal">
         <figcaption>Isn't it a beauty? It's all text!</figcaption>
       </figure>`,
      BASE,
    );

    expect(images[0]).toMatchObject({
      alt: "A terminal",
      caption: "Isn't it a beauty? It's all text!",
    });
  });

  it("files the same url once however often it appears", () => {
    const images = extractImages(
      `<img src="/same.jpg"><img src="/same.jpg"><img src="/other.jpg">`,
      BASE,
    );

    expect(images).toHaveLength(2);
  });

  it("keeps document order and stops at a sane number", () => {
    const many = Array.from(
      { length: 40 },
      (_, i) => `<img src="/photo-${i}.jpg">`,
    ).join("");
    const images = extractImages(many, BASE);

    expect(images).toHaveLength(24);
    expect(images[0]?.url).toBe("https://example.com/photo-0.jpg");
  });

  it("ignores a protocol it cannot show", () => {
    expect(extractImages(`<img src="ftp://example.com/a.jpg">`, BASE)).toEqual(
      [],
    );
  });
});
