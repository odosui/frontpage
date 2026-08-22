import * as sources from "../../../models/sources";
import { Source } from "../../../api/types";
import { AgentTool } from "../types";

export const getSources: AgentTool = {
  name: "GET_SOURCES",
  usage: "<|GET_SOURCES|>",
  description:
    "The outlets this dashboard pulls headlines from: name, kind, how many articles we hold from each, and when it was last fetched. " +
    "This is the whole of what the arc can ever see — a subject none of these outlets covers will simply be absent, which is a gap in the sources and not a fact about the world. " +
    "Use it before concluding that nothing happened, and to say which outlet a claim rests on.",
  run: async (_args, ctx) => {
    const rows = await sources.forDashboard(ctx.dashboardId);
    if (rows.length === 0) {
      return "(this dashboard reads no sources yet, so no article can arrive here)";
    }
    return rows.map(describe).join("\n");
  },
};

function describe(s: Source): string {
  const fetched = s.fetchedAt
    ? `last fetched ${s.fetchedAt.slice(0, 16).replace("T", " ")}`
    : "never fetched";
  return `${s.name} — ${s.kind}, ${s.articleCount} articles, ${fetched} — ${s.url}`;
}
