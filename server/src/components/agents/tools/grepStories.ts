import * as stories from "../../../models/stories";
import { AgentTool } from "../types";
import { count } from "./utils/args";

export const grepStories: AgentTool = {
  name: "GREP_STORIES",
  usage: '<|GREP_STORIES "novorossiysk" 200|>',
  description:
    "Stories already filed whose title contains the given text, newest first. Use it before writing a story title: if this event is already there, reuse that title exactly and the article joins it.",
  run: async (args, ctx) => {
    const term = args[0] ?? "";
    if (!term) return "ERROR: GREP_STORIES needs a search term.";

    const rows = await stories.search(
      ctx.dashboardId,
      term,
      count(args.slice(1), 200),
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
