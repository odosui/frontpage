import * as stories from "../../../models/stories";
import { AgentTool } from "../types";
import { count } from "./utils/args";

export const getStories: AgentTool = {
  name: "GET_STORIES",
  usage: "<|GET_STORIES 50|>",
  description:
    "The stories already filed under this dashboard, newest first, with how many articles each holds. Use it before writing a story title: if the event is in this list, reuse that story's title exactly and the article joins it instead of starting a near duplicate beside it.",
  run: async (args, ctx) => {
    const rows = await stories.latest(ctx.dashboardId, count(args, 50));
    if (rows.length === 0) return "(no stories filed here yet)";
    return rows
      .map((s) => `${s.title} — ${s.articleCount} articles`)
      .join("\n");
  },
};
