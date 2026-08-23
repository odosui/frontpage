import * as facts from "../../../models/facts";
import { AgentTool } from "../types";

/**
 * What the dashboard is already taken to have established.
 *
 * Uncapped and unsearchable, unlike GET_STORIES: the fact list is the one
 * thing here that is meant to be read whole. REVISE_FACTS takes the entire set
 * every time — whatever is left out is dropped — so a tool that returned a
 * page of it, or only the lines matching a term, would be handing the model a
 * loaded gun. Reading all of them is the only safe way to rewrite all of them.
 * The list is a dashboard's standing knowledge rather than its coverage, so it
 * stays in the tens of lines where the story feed runs to hundreds.
 *
 * Each line carries the two things a revision cannot be written without: the
 * fact's id, and the articles it already rests on.
 */
export const getFacts: AgentTool = {
  name: "GET_FACTS",
  usage: "<|GET_FACTS|>",
  description:
    "Everything this dashboard has established, newest first: each fact's id, how sure it is, the line itself, and the articles it already rests on. " +
    "Returns the whole list — there is no page and no search, because REVISE_FACTS rewrites the whole list and anything you have not read is something you would drop. " +
    "Read it before you revise: these are the ids REVISE_FACTS takes, and reusing a fact's id is what edits it in place instead of filing a duplicate beside it. " +
    "The article ids on each line are the citations it already carries, so you can see at a glance whether what you have just read is a second source for a standing claim or a new one.",
  run: async (_args, ctx) => {
    const known = await facts.forDashboard(ctx.dashboardId);
    if (known.length === 0) {
      return "(nothing established here yet — whatever you write is the first version)";
    }
    return known.map(describe).join("\n");
  },
};

function describe(fact: facts.FactWithSource): string {
  const label = facts.CONFIDENCE_LABELS[fact.confidence] ?? "";
  // every article it already rests on, with the id, so a citation can be left
  // alone, added to, or dropped without going looking for it again
  const sources =
    fact.sources.length > 0
      ? `, from ${fact.sources
          .map((source) => `${source.id} "${source.title}"`)
          .join("; ")}`
      : "";
  return `- ${fact.id} [${fact.confidence}/5 ${label}] ${fact.content}${sources}`;
}
