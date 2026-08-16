import * as tags from "../../../models/tags";
import { AgentTool } from "../types";

export const getTags: AgentTool = {
  name: "GET_TAGS",
  usage: "<|GET_TAGS|>",
  description:
    "Every tag with its article count, most-used first. Use it to reuse the established vocabulary instead of inventing near-duplicates.",
  run: async (_args, ctx) => {
    const rows = await tags.popular(ctx.dashboardId);
    if (rows.length === 0) return "(no tags yet)";
    return rows.map((t) => `${t.name} (${t.articleCount})`).join("\n");
  },
};
