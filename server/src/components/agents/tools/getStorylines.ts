import * as storylines from "../../../models/storylines";
import { AgentTool } from "../types";
import { count } from "./utils/args";

export const getStorylines: AgentTool = {
  name: "GET_STORYLINES",
  usage: "<|GET_STORYLINES 200|>",
  description:
    "The most recent storylines, newest first, with how many stories each holds. Use it before naming a new storyline.",
  run: async (args, ctx) => {
    const rows = await storylines.latest(ctx.dashboardId, count(args, 200));
    if (rows.length === 0) return "(no storylines yet)";
    return rows.map((s) => `${s.title} — ${s.storyCount} stories`).join("\n");
  },
};
