import * as storylines from "../../../models/storylines";
import { AgentTool } from "../types";
import { count } from "./args";

export const grepStorylines: AgentTool = {
  name: "GREP_STORYLINES",
  usage: '<|GREP_STORYLINES "iran" 10|>',
  description:
    "Storylines whose title contains the given text. Use it to check whether an arc already exists before starting one.",
  run: async (args, ctx) => {
    const term = args[0] ?? "";
    if (!term) return "ERROR: GREP_STORYLINES needs a search term.";
    const rows = await storylines.search(
      ctx.dashboardId,
      term,
      count(args.slice(1), 10),
    );
    if (rows.length === 0) return `(no storyline matching "${term}")`;
    return rows
      .map((s) => `#${s.id} ${s.title} — ${s.storyCount} stories`)
      .join("\n");
  },
};
