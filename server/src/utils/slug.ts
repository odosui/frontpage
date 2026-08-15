/**
 * Url-safe key for a title or tag name. Storylines and tags are matched by
 * slug within a dashboard, so this is what decides whether "US election" and
 * "U.S. Elections" are the same row — case, punctuation and spacing are all
 * flattened away.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    // intra-word punctuation vanishes rather than splitting the word, so
    // "U.S." and "US" land on the same key
    .replace(/['\u2019.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
