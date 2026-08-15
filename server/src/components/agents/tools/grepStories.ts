import * as stories from "../../../models/stories";
import { AgentTool } from "../types";
import { count } from "./args";

/**
 * Merging only ever worked inside one batch: two outlets covering the same
 * event in different runs each got their own story. Looking a story up by name
 * lets a run attach to one an earlier run already filed — reusing the exact
 * title matches its slug on save, and the article joins that story.
 */
export const grepStories: AgentTool = {
  name: "GREP_STORIES",
  usage: '<|GREP_STORIES "novorossiysk" 10|>',
  description:
    "Stories already filed whose title contains the given text, newest first. Use it before writing a story title: if this event is already there, reuse that title exactly and the article joins it.",
  run: async (args, ctx) => {
    const term = args[0] ?? "";
    if (!term) return "ERROR: GREP_STORIES needs a search term.";

    const rows = await stories.search(
      ctx.dashboardId,
      term,
      count(args.slice(1), 10),
    );
    if (rows.length === 0) return `(no story matching "${term}")`;

    return rows
      .map(
        (s) =>
          `${s.title} — ${s.articleCount} articles` +
          (s.storyline ? ` — under ${s.storyline}` : " — standalone"),
      )
      .join("\n");
  },
};
