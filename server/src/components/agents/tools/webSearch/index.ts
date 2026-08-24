import { formatResults, search } from "../../../websearch/Brave";
import { AgentTool } from "../../types";
import { LANGS } from "./langs";

/** Enough to see the shape of the coverage without flooding the context. */
const RESULT_COUNT = 8;

/** Brave's own freshness tokens; anything else must be an explicit range. */
const WINDOWS = new Set(["pd", "pw", "pm", "py"]);

const RANGE_RE = /^\d{4}-\d{2}-\d{2}to\d{4}-\d{2}-\d{2}$/;

export const webSearch: AgentTool = {
  name: "WEB_SEARCH",
  usage: '<|WEB_SEARCH "wildberries warehouse drone strike" pd ru|>',
  description:
    "After the query come two optional arguments, in either order. " +
    "A freshness window restricts results by age: pd past day, pw past week, pm past month, py past year. Use it whenever the question is about a live event, because without it the top results skew to older, better-linked coverage of the same story: pd for something breaking today, pw for an event from the past few days. " +
    "Leave it off for background that does not go stale, like who a person is. " +
    "A two-letter language code (ru, de, fr, uk, zh) searches that language's press instead of the default English.",
  run: async (args) => {
    const query = args[0] ?? "";
    if (!query) return "ERROR: WEB_SEARCH needs a query.";

    // Both modifiers are short lowercase tokens, so they are told apart by
    // shape rather than by position — the model should not have to remember
    // which slot a language goes in, or pad one to reach the other.
    const rest = args.slice(1);
    const freshness = rest.find(isFreshness);
    const searchLang = rest.find((a) => !isFreshness(a) && isLang(a));

    const unknown = rest.find((a) => a !== freshness && a !== searchLang);
    if (unknown) {
      return `ERROR: "${unknown}" is neither a freshness window (pd, pw, pm, py) nor a two-letter language code.`;
    }

    try {
      const results = await search(query, {
        count: RESULT_COUNT,
        ...(freshness ? { freshness } : {}),
        ...(searchLang ? { searchLang } : {}),
      });
      if (results.length === 0) {
        return freshness
          ? `(nothing for "${query}" within ${freshness} — try again without the freshness argument)`
          : `(nothing for "${query}")`;
      }
      return formatResults(results);
    } catch (err) {
      // A search that is down is not an answer: say so plainly, so the agent
      // reasons from what it has rather than reading a silent [] as "nothing
      // happened".
      return `ERROR: web search failed — ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

function isFreshness(value: string): boolean {
  return WINDOWS.has(value) || RANGE_RE.test(value);
}

function isLang(value: string): boolean {
  return LANGS.has(value);
}
