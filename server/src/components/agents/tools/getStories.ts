import * as stories from "../../../models/stories";
import { AgentTool } from "../types";
import { MAX_ROWS } from "./utils/args";

/** Enough of the arc to see what is already filed, without flooding the turn. */
const DEFAULT_ROWS = 50;

/**
 * The stories filed here, listed or grepped.
 *
 * These were two tools — GET_STORIES and GREP_STORIES — over one query with
 * the `ilike` on or off. Two tools meant two descriptions, each of which had
 * to explain the other ("read GET_STORIES too before deciding nothing is
 * there"), and a model choosing between them before it had seen either list.
 * One tool with an optional term is the same power and one decision fewer.
 */
export const getStories: AgentTool = {
  name: "GET_STORIES",
  usage: '<|GET_STORIES|> or <|GET_STORIES "novorossiysk" 200|>',
  description:
    "The stories already filed under this dashboard, newest first, with how many articles each holds and when the newest of them was published. " +
    "Called bare it lists them; given a word in quotes it returns only the stories whose title contains it, and a number caps how many come back. " +
    "Use it before writing a story title: if the event is in this list, reuse that story's title exactly and the article joins it instead of starting a near duplicate beside it. " +
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

/**
 * The term and the row cap, told apart by shape rather than by position: a
 * bare number is the cap, anything else is what to search for. So every form
 * the model reaches for reads the same — bare, a term, a count, or both, in
 * either order — and there is no argument order to remember.
 */
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
