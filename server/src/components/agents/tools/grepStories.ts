import * as stories from "../../../models/stories";
import { AgentTool } from "../types";
import { count } from "./utils/args";

export const grepStories: AgentTool = {
  name: "GREP_STORIES",
  usage: '<|GREP_STORIES "novorossiysk" 200|>',
  description:
    "Stories in this dashboard whose title contains the given text, newest first. Narrower than GET_STORIES and worth reaching for when the list is long — but it only finds an event you can already guess the wording of, so read GET_STORIES too before deciding nothing is there.",
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
      .map((s) => `${s.title} — ${s.articleCount} articles`)
      .join("\n");
  },
};
