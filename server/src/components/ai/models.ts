const DEFAULT_SMALL_MODEL = "google/gemini-3.1-flash-lite";
// picked by benchmarking ten models over the same 50-article batch: clean
// running arcs and the best coverage per second, at a fifth of the cost of
// the models that matched it on quality
const DEFAULT_BIG_MODEL = "openai/gpt-5.6-sol";

export const SMALL_MODEL =
  process.env.FRONTPAGE_MODEL_SMALL || DEFAULT_SMALL_MODEL;

export const BIG_MODEL = process.env.FRONTPAGE_MODEL_BIG || DEFAULT_BIG_MODEL;
