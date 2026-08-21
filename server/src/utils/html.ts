/**
 * Turning markup back into text. Shared by the feed parser, which reads titles
 * and summaries out of xml, and the article extractor, which flattens the
 * readable html of a page into something a modal can show.
 */

/**
 * The named entities that actually turn up in feeds and article html: the
 * five xml ones, and the typography publishers write with. Everything else is
 * numeric by the time it reaches us, and numeric is handled below.
 *
 * Not a complete html5 table on purpose — that is 2,231 names, nearly all of
 * them for characters no newsroom has ever typed.
 */
const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  // spaces, and the hyphen that is only a suggestion
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  shy: "",
  // dashes and dots
  ndash: "–",
  mdash: "—",
  hellip: "…",
  middot: "·",
  bull: "•",
  // quotes, including the guillemets russian-language sources quote with
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  sbquo: "‚",
  bdquo: "„",
  // signs
  deg: "°",
  plusmn: "±",
  times: "×",
  minus: "−",
  copy: "©",
  reg: "®",
  trade: "™",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  sect: "§",
  para: "¶",
  dagger: "†",
  permil: "‰",
  prime: "′",
  Prime: "″",
};

/**
 * Text arrives entity-encoded, sometimes twice over (`&amp;#39;`), and both
 * callers display it verbatim — so decode rather than pass the escapes through.
 */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (whole, body: string) => {
    if (body.startsWith("#")) {
      const code = body.startsWith("#x")
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    // exact first: `&Prime;` (″) is not `&prime;` (′), and html is one of the
    // few places where the case of a name carries meaning
    return ENTITIES[body] ?? ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Tags that end a line of prose rather than sitting inside one. */
const BLOCK = "p|div|br|h[1-6]|li|tr|blockquote|pre|section|article|figcaption";

/**
 * Flatten html to plain text, keeping paragraph breaks. Inline tags close up
 * so a `<em>` mid-sentence doesn't split a word, block tags become a blank
 * line — without that an article reads as one unbroken wall.
 */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(new RegExp(`</?(?:${BLOCK})(?:\\s[^>]*)?>`, "gi"), "\n\n")
      .replace(/<[^>]*>/g, ""),
  )
    // a tab or a stray newline inside a paragraph is still one space
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    // three or more blank lines say nothing the first two don't
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
