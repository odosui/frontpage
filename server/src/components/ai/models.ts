/**
 * The two OpenRouter models the app uses. Small does the high-volume, shallow
 * work (one call per front page fetched); big does the rare, structural work
 * where a weaker model visibly degrades the result.
 */

/**
 * Extracting articles out of a front page. Runs on every channel refresh, on
 * 200k characters of HTML, so it has to be fast, cheap and non-reasoning.
 */
export const SMALL_MODEL = normalizeModel(
  process.env.FRONTPAGE_MODEL_SMALL || process.env.FRONTPAGE_MODEL ||
    "google/gemini-3.1-flash-lite",
);

/**
 * Grouping articles into category → bigger story → story. Compared across five
 * models on the same 20 headlines: Opus was the only one that reliably built a
 * real middle level instead of restating each event as its own arc.
 */
export const BIG_MODEL = normalizeModel(
  process.env.FRONTPAGE_MODEL_BIG || "anthropic/claude-opus-5",
);

/** Older configs prefixed the id with the provider; accept those unchanged. */
function normalizeModel(value: string): string {
  return value.startsWith("openrouter/") ? value.slice("openrouter/".length) : value;
}
