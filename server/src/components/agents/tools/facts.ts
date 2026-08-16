import * as facts from "../../../models/facts";
import * as storylines from "../../../models/storylines";
import { AgentContext, AgentTool } from "../types";

/**
 * The analyst's own notes, kept between conversations. Everything else it can
 * call reads what the world reported; this is where it writes down what it has
 * concluded, so the next session starts from what was settled rather than
 * working it out again.
 *
 * Unlike a merge these are not gated: a fact is one line, visible in the pane
 * beside the chat, and the reader can edit or delete any of them.
 */
export const addFact: AgentTool = {
  name: "ADD_FACT",
  usage:
    '<|ADD_FACT "Russian-Ukrainian war" "**Wildberries** warehouses supply drone components since **July 2026**, per Ukrainian claims" 2 9241|>',
  description:
    "Writes down something the storyline has established: the arc's exact title, the fact in one line, then how sure it is from 1 to 5 — 1 rumour, 2 one source, 3 reported, 4 corroborated, 5 certain. " +
    "Optionally the id of the article it rests on, from GET_STORY. " +
    "Add a fact when you have learned something that will still matter next week and is not already in the list you were given — not a summary of today's news, which the stories already hold. " +
    "Write it so it stands on its own: someone reading only the fact should know what it claims and how firm it is. " +
    "Wrap the load-bearing parts in **double asterisks** — the figures, the dates, the people and organisations doing the thing — so the line can be skimmed for what it establishes. Mark those, not whole clauses.",
  run: async (args, ctx) => {
    const [arc, content, confidence, articleId] = args;
    if (!arc || !content) {
      return "ERROR: ADD_FACT needs a storyline title and the fact itself.";
    }

    const storyline = await resolve(ctx, arc);
    if (!storyline) {
      return `ERROR: no storyline matching "${arc}" — use the exact title.`;
    }

    const fact = await facts.create({
      dashboardId: ctx.dashboardId,
      storylineId: storyline.id,
      content,
      confidence: Number(confidence) || facts.DEFAULT_CONFIDENCE,
      articleId: articleId ? Number(articleId) : null,
    });

    return `Noted as fact #${fact.id} (${describe(fact.confidence)}): ${fact.content}`;
  },
};

export const updateFact: AgentTool = {
  name: "UPDATE_FACT",
  usage:
    '<|UPDATE_FACT 12 4 "**Wildberries** warehouses supplied drone components"|>',
  description:
    "Changes a fact you were given, by its id: a number from 1 to 5 sets how sure it is, a quoted line replaces its wording, and you can pass either or both in any order. " +
    "New wording keeps the same **double asterisk** marking as ADD_FACT, around the figures, dates and actors. " +
    "Use it when new reporting firms something up or undercuts it — a fact that turns out to be wrong should be corrected or deleted, not left standing beside its contradiction.",
  run: async (args, ctx) => {
    const id = Number(args[0]);
    if (!Number.isFinite(id)) {
      return "ERROR: UPDATE_FACT needs a fact id, as a number.";
    }

    // Told apart by shape, so the model needn't remember an argument order for
    // two things that are never confusable: one is a digit, the other a line.
    const rest = args.slice(1);
    const confidence = rest.find((a) => /^[1-5]$/.test(a));
    const content = rest.find((a) => !/^[1-5]$/.test(a));
    if (confidence === undefined && content === undefined) {
      return "ERROR: UPDATE_FACT needs a new confidence (1-5), new wording, or both.";
    }

    const updated = await facts.update(ctx.dashboardId, id, {
      ...(content !== undefined ? { content } : {}),
      ...(confidence !== undefined ? { confidence: Number(confidence) } : {}),
    });
    if (!updated) return `(no fact #${id} in this dashboard)`;

    return `Fact #${updated.id} is now (${describe(updated.confidence)}): ${updated.content}`;
  },
};

export const deleteFact: AgentTool = {
  name: "DELETE_FACT",
  usage: "<|DELETE_FACT 12|>",
  description:
    "Removes a fact by its id. For one that turned out to be false or that never belonged — if it is merely less certain than it looked, lower its confidence with UPDATE_FACT instead of deleting it.",
  run: async (args, ctx) => {
    const id = Number(args[0]);
    if (!Number.isFinite(id)) {
      return "ERROR: DELETE_FACT needs a fact id, as a number.";
    }

    const existing = await facts.get(ctx.dashboardId, id);
    if (!existing) return `(no fact #${id} in this dashboard)`;

    await facts.remove(ctx.dashboardId, id);
    return `Deleted fact #${id}: ${existing.content}`;
  },
};

/** Exact slug first, then a loose title match — the same way stories resolve. */
async function resolve(ctx: AgentContext, title: string) {
  const found = await storylines.search(ctx.dashboardId, title, 1);
  return found[0] ?? null;
}

function describe(confidence: number): string {
  return `${confidence}/5 ${facts.CONFIDENCE_LABELS[confidence] ?? ""}`.trim();
}
