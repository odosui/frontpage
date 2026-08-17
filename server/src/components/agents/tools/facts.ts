import * as facts from "../../../models/facts";
import * as storylines from "../../../models/storylines";
import { AgentContext, AgentTool } from "../types";

/**
 * The analyst's own notes, kept between conversations. Everything else it can
 * call reads what the world reported; this is where it writes down what it has
 * concluded, so the next session starts from what was settled rather than
 * working it out again.
 *
 * The list is revised whole rather than a line at a time. What an arc
 * establishes is one document — raising the confidence on one fact usually
 * happens because of what another now says — and writing it in one call means
 * one reasoning covers the change the analyst actually made, instead of three
 * disconnected edits nobody can read back later.
 *
 * Nothing is gated: the versions are visible in the pane beside the chat, and
 * the reader can revise them in turn or read back to what stood before.
 */
export const reviseFacts: AgentTool = {
  name: "REVISE_FACTS",
  usage:
    '<|REVISE_FACTS "Russian-Ukrainian war" "Reuters has now put a second source behind the July shipment, so the supply claim stops being a Ukrainian allegation" f3 "**Wildberries** warehouses have supplied drone components since **July 2026**, first reported by **Reuters** on **12 August 2026**" 4 9241 "The **Kaluga** plant reopened on **3 August**, per **Kommersant**" 2|>',
  description:
    "Rewrites what a storyline has established, as a new version: the arc's exact title, one line saying why the set changed, then the facts. " +
    "Each fact is its id (as given to you, e.g. f3) if it already exists and nothing if it is new, then the line in quotes, then how sure it is from 1 to 5 — 1 rumour, 2 one source, 3 reported, 4 corroborated, 5 certain — and optionally the id of the article it rests on, from GET_STORY. " +
    "Pass the WHOLE list every time, including the facts you are not touching, keeping their ids: whatever you leave out is dropped, which is how a fact that turned out to be false is removed. " +
    "Keep a fact when it is merely shakier than it looked and lower its confidence instead. " +
    "Write each line so it stands on its own, record what will still matter next week rather than a summary of today's news, and wrap the load-bearing parts — figures, dates, the people and organisations acting — in **double asterisks**. Mark those, not whole clauses. " +
    "Anchor it in time wherever the claim has a date: when the thing happened, when it was reported, or both when they differ — written into the line itself, not left to the fact's own age. " +
    "Name who says so in the line too, and name the outlet or person that reported it first rather than whoever you read repeating it. " +
    "The reasoning is kept with the version, so the reader can read back why the knowledge moved.",
  run: async (args, ctx) => {
    const [arc, reasoning] = args;
    if (!arc) {
      return "ERROR: REVISE_FACTS needs the storyline title first.";
    }
    if (!reasoning?.trim()) {
      return "ERROR: REVISE_FACTS needs the reasoning behind the revision, in quotes, right after the storyline title.";
    }

    const storyline = await resolve(ctx, arc);
    if (!storyline) {
      return `ERROR: no storyline matching "${arc}" — use the exact title.`;
    }

    const before = await facts.forStoryline(ctx.dashboardId, storyline.id);
    const drafts = parseFacts(args.slice(2));
    if (drafts.length === 0 && before.length > 0) {
      return (
        "ERROR: REVISE_FACTS was given no facts, which would erase all " +
        `${before.length} of them. Pass the whole list, including the ones you are keeping.`
      );
    }

    const version = await facts.revise(ctx.dashboardId, storyline.id, {
      facts: drafts,
      author: "analyst",
      reasoning,
    });

    return summarize(before, version);
  },
};

/**
 * The facts as the model wrote them: `[id] "content" [confidence] [articleId]`,
 * repeated. They are told apart by shape rather than by position, the way
 * FORECAST tells a probability from its reasoning — an `fN` is an id, a quoted
 * line is content, a bare 1-5 is confidence, and a larger number is an article.
 * Nothing here is confusable with anything else, so the model never has to
 * remember an order.
 */
export function parseFacts(args: string[]): facts.FactDraft[] {
  const drafts: facts.FactDraft[] = [];
  let pending: string | undefined;

  for (const arg of args) {
    const token = arg.trim();
    if (!token) continue;

    if (/^f\d+$/i.test(token)) {
      pending = token.toLowerCase();
      continue;
    }

    if (/^\d+$/.test(token)) {
      const value = Number(token);
      const last = drafts[drafts.length - 1];
      if (!last) continue;
      // the scale stops at 5, so anything bigger is the article it cites
      if (value <= facts.MAX_CONFIDENCE) last.confidence = value;
      else last.articleId = value;
      continue;
    }

    drafts.push({
      ...(pending ? { id: pending } : {}),
      content: token,
    });
    pending = undefined;
  }

  return drafts;
}

/**
 * What the revision did, in the terms the analyst wrote it: a list it retyped
 * from memory can silently lose a line, so dropped facts are named rather than
 * counted.
 */
function summarize(
  before: facts.Fact[],
  version: facts.FactsVersion,
): string {
  const kept = new Set(version.facts.map((f) => f.id));
  const dropped = before.filter((f) => !kept.has(f.id));
  const added = version.facts.filter(
    (f) => !before.some((b) => b.id === f.id),
  );

  const lines = version.facts.map(
    (f) => `- ${f.id} [${describe(f.confidence)}] ${f.content}`,
  );

  const notes = [
    added.length > 0 ? `${added.length} new` : "",
    dropped.length > 0
      ? `dropped ${dropped.map((f) => `${f.id} "${f.content}"`).join(", ")}`
      : "",
  ].filter(Boolean);

  return [
    `Wrote version ${version.version}: ${version.facts.length} facts` +
      (notes.length > 0 ? ` (${notes.join("; ")})` : ""),
    "",
    lines.join("\n"),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Exact slug first, then a loose title match — the same way stories resolve. */
async function resolve(ctx: AgentContext, title: string) {
  const found = await storylines.search(ctx.dashboardId, title, 1);
  return found[0] ?? null;
}

function describe(confidence: number): string {
  return `${confidence}/5 ${facts.CONFIDENCE_LABELS[confidence] ?? ""}`.trim();
}
