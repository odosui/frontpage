import * as stories from "../../../models/stories";
import { AgentTool } from "../types";
import { MAX_ROWS } from "./utils/args";

const DEFAULT_ROWS = 100;

export const getStories: AgentTool = {
  name: "GET_STORIES",
  usage: '<|GET_STORIES|> or <|GET_STORIES "novorossiysk" 200|>',
  description:
    "The stories already filed under this dashboard, newest first, with how many articles each holds and when the newest of them was published. " +
    "Called bare it lists them; given a word in quotes it returns only the stories whose title contains it, and a number caps how many come back. " +
    "Search when you already know the wording to look for; list when you do not — a story someone named differently is one a search will miss and the list will not.",
  run: async (args, ctx) => {
    const { term, limit } = parseArgs(args);
    const rows = await stories.list(ctx.dashboardId, { term, limit });

    if (rows.length === 0) {
      return term
        ? `(no story matching "${term}")`
        : "(no stories filed here yet)";
    }
    return rows
      .map((s) => {
        const when = s.updatedAt
          ? `, last ${s.updatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`
          : "";
        return `${s.title} — ${s.articleCount} articles${when}`;
      })
      .join("\n");
  },
};

export function parseArgs(args: string[]): { term: string; limit: number } {
  let term = "";
  let limit = DEFAULT_ROWS;

  for (const arg of args) {
    const token = arg.trim();
    if (!token) continue;
    if (/^\d+$/.test(token)) {
      const n = Number(token);
      if (n > 0) limit = Math.min(n, MAX_ROWS);
      continue;
    }
    if (!term) term = token;
  }

  return { term, limit };
}
