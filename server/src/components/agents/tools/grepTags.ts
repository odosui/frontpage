import * as tags from "../../../models/tags";
import { AgentTool } from "../types";
import { count } from "./args";

export const grepTags: AgentTool = {
  name: "GREP_TAGS",
  usage: '<|GREP_TAGS "elect" 10|>',
  description:
    "Tags whose name contains the given text. Use it to find the exact existing spelling of a tag you are about to use.",
  run: async (args, ctx) => {
    const term = args[0] ?? "";
    if (!term) return "ERROR: GREP_TAGS needs a search term.";
    const rows = await tags.search(
      ctx.dashboardId,
      term,
      count(args.slice(1), 10),
    );
    if (rows.length === 0) return `(no tag matching "${term}")`;
    return rows.map((t) => `${t.name} (${t.articleCount})`).join("\n");
  },
};
