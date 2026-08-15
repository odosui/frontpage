import * as tags from "../../../models/tags";
import { AgentTool } from "../types";
import { count } from "./args";

export const getTags: AgentTool = {
  name: "GET_TAGS",
  usage: "<|GET_TAGS 40|>",
  description:
    "The most-used tags with their article counts. Use it to reuse the established vocabulary instead of inventing near-duplicates.",
  run: async (args, ctx) => {
    const rows = await tags.popular(ctx.dashboardId, count(args, 40));
    if (rows.length === 0) return "(no tags yet)";
    return rows.map((t) => `${t.name} (${t.articleCount})`).join("\n");
  },
};
