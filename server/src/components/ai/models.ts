const DEFAULT_SMALL_MODEL = "google/gemini-3.1-flash-lite";
const DEFAULT_BIG_MODEL = "anthropic/claude-opus-5";

export const SMALL_MODEL =
  process.env.FRONTPAGE_MODEL_SMALL || DEFAULT_SMALL_MODEL;

export const BIG_MODEL = process.env.FRONTPAGE_MODEL_BIG || DEFAULT_BIG_MODEL;
