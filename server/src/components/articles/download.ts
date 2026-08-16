import { readCapped, requestDocument } from "../http";

/** An article page, unlike a feed, is one document read once. */
const HTML_LIMIT = 3_000_000;

/**
 * Fetch one article's page as html. No conditional request and no snapshot:
 * this runs when a reader asks for a specific article's text, which is rare
 * enough that a validator would never hit.
 */
export async function fetchArticlePage(url: string): Promise<string> {
  const res = await requestDocument(url, {
    accept: "text/html,application/xhtml+xml",
    allowedTypes: /text\/html|application\/xhtml\+xml/i,
  });

  const html = await readCapped(res);
  // Postgres rejects NUL in a text column
  return html.replace(/\u0000/g, "").slice(0, HTML_LIMIT);
}
