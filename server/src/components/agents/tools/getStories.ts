import * as stories from "../../../models/stories";
import { AgentTool } from "../types";
import { count } from "./utils/args";

export const getStories: AgentTool = {
  name: "GET_STORIES",
  usage: '<|GET_STORIES "Russian-Ukrainian war" 20|>',
  description:
    "The stories already filed under one storyline, newest first. Use it after you know which arc an article belongs to: if the event is in this list, reuse that story's title exactly.",
  run: async (args, ctx) => {
    const term = args[0] ?? "";
    if (!term) return "ERROR: GET_STORIES needs a storyline title.";

    const found = await stories.underStoryline(
      ctx.dashboardId,
      term,
      count(args.slice(1), 200),
    );
    if (!found) return `(no storyline matching "${term}")`;
    if (found.stories.length === 0) {
      return `${found.storyline} — (no stories yet)`;
    }

    return (
      `${found.storyline}\n` +
      found.stories
        .map((s) => `- ${s.title} — ${s.articleCount} articles`)
        .join("\n")
    );
  },
};
