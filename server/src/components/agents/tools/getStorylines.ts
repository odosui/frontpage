import * as storylines from "../../../models/storylines";
import { AgentTool } from "../types";
import { count } from "./args";

/**
 * Compact lines, not JSON — the model reads these, and tokens cost money.
 * No row ids: the model is told to reuse a storyline's exact title, and when
 * the line started with "#61 " it copied that into the title it wrote back,
 * compounding a prefix per run ("#94 #61 standalone").
 */
export const getStorylines: AgentTool = {
  name: "GET_STORYLINES",
  usage: "<|GET_STORYLINES 200|>",
  description:
    "The most recent storylines, newest first, with how many stories each holds. Use it before naming a new storyline.",
  run: async (args, ctx) => {
    const rows = await storylines.latest(ctx.dashboardId, count(args, 20));
    if (rows.length === 0) return "(no storylines yet)";
    return rows.map((s) => `${s.title} — ${s.storyCount} stories`).join("\n");
  },
};
