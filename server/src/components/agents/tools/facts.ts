import * as facts from "../../../models/facts";
import { AgentTool } from "../types";

/**
 * The analyst's own notes on this dashboard, kept between conversations.
 * Everything else it can call reads what the world reported; this is where it
 * writes down what it has concluded, so the next session starts from what was
 * settled rather than working it out again.
 *
 * The call says what changed, not what the list is. It used to take the whole
 * set every time, and the whole set is what a model produces when asked for
 * it: a run that meant to raise one confidence retyped forty lines, and the
 * retyping was where facts quietly lost a clause, gained a rewording nobody
 * asked for, or fell off the end altogether. Naming the three facts that moved
 * is both cheaper and the only version of the call whose diff means what it
 * says.
 *
 * It is still one version in the history. A revision is what the analyst
 * concluded in one go — raising the confidence on one fact usually happens
 * because of what another now says — and one call, one reasoning, one version
 * keeps that legible; the edits inside it are simply named rather than
 * implied by what was left out.
 *
 * Nothing is gated: the versions are visible in the pane beside the chat, and
 * the reader can revise them in turn or read back to what stood before.
 */
export const reviseFacts: AgentTool = {
  name: "REVISE_FACTS",
  usage:
    '<|REVISE_FACTS "Reuters has now put a second source behind the July shipment, so the supply claim stops being a Ukrainian allegation" f3 "**Wildberries** warehouses have supplied drone components since **July 2026**, first reported by **Reuters** on **12 August 2026**" 4 9241 9310 "The **Kaluga** plant reopened on **3 August**, per **Kommersant**" 2 -f8|>',
  description:
    "Records what changed in what this dashboard has established, as a new version: one line saying why, then only the facts that moved. " +
    "Anything you do not name is kept exactly as it stands — never retype the list. " +
    "There are three kinds of change, told apart by shape: " +
    "an existing id (as given by GET_FACTS, e.g. f3) followed by any of a new line in quotes, a confidence from 1 to 5, and the ids of further articles it now rests on, changes that fact and leaves out whatever you do not give — `f3 4` alone just raises its confidence; " +
    "a line in quotes with no id in front of it files a new fact, again with its confidence and the articles behind it; " +
    "and a minus in front of an id, `-f8`, deletes that fact — which is what you do with one that turned out to be false, and only that. Keep a fact when it is merely shakier than it looked and lower its confidence instead. " +
    "Confidence runs 1 rumour, 2 one source, 3 reported, 4 corroborated, 5 certain. " +
    "A fact can rest on several articles, so give every article that carries the claim: the one that broke it and the ones that corroborate, date or extend it. Citing the second article behind a standing claim is usually the point of a revision — it is what takes a fact from one source to corroborated. The ids you name are added to what the fact already cites, so you never retype a citation to keep it. " +
    "An id you name must be one GET_FACTS actually returned: if it is not, nothing is written at all, so read the list before you change it. " +
    "Write each line so it stands on its own, record what will still matter next week rather than a summary of today's news, and wrap the load-bearing parts — figures, dates, the people and organisations acting — in **double asterisks**. Mark those, not whole clauses. " +
    "Anchor it in time wherever the claim has a date: when the thing happened, when it was reported, or both when they differ — written into the line itself, not left to the fact's own age. " +
    "Name who says so in the line too, and name the outlet or person that reported it first rather than whoever you read repeating it. " +
    "The reasoning is kept with the version, so the reader can read back why the knowledge moved.",
  run: async (args, ctx) => {
    const [reasoning] = args;
    if (!reasoning?.trim()) {
      return "ERROR: REVISE_FACTS needs the reasoning behind the revision first, in quotes.";
    }

    const edits = parseEdits(args.slice(1));
    if (edits.length === 0) {
      return (
        "ERROR: REVISE_FACTS was given no changes. Name the facts that moved — " +
        "`f3 \"the new line\" 4 9241` to change one, a quoted line on its own to " +
        "add one, `-f3` to delete one — and leave the rest alone."
      );
    }

    // A fact is a sentence. A single word is what a mis-parsed call looks
    // like — one bare token per space, each landing here as its own new
    // fact — and writing that would litter the list with rubble and keep the
    // version forever. Refusing the whole call costs a retry; the alternative
    // costs the reader their fact list.
    const fragments = written(edits).filter(
      (content) => !/\s/.test(content.trim()),
    );
    if (fragments.length > 0) {
      return (
        `ERROR: ${fragments.length} of the lines you wrote is a single word, ` +
        `starting with "${fragments[0]}" — nothing was changed. ` +
        "Each fact must be a whole line, wrapped in quotes. If the line itself " +
        "contains a quotation mark, that is what broke the call: write it as " +
        '\\" or use the guillemets the source did.'
      );
    }

    const { version, before, unknown } = await facts.amend(ctx.dashboardId, {
      edits,
      author: "analyst",
      reasoning,
    });

    if (!version) {
      return (
        `ERROR: this dashboard has no fact ${unknown.join(", ")} — nothing was ` +
        "changed. Call GET_FACTS for the ids as they stand, then name only " +
        "those. To file something new, write the line with no id in front of it."
      );
    }

    return summarize(before, version, edits);
  },
};

/**
 * The changes as the model wrote them:
 * `[-]id`, quoted lines, and bare numbers, in any mixture. They are told apart
 * by shape rather than by position, the way FORECAST tells a likelihood from
 * its reasoning — an `fN` names a fact to change, `-fN` deletes it, a quoted
 * line straight after an id is that fact's new wording and anywhere else is a
 * new fact, a bare 1-5 is confidence, and a larger number is an article.
 * Nothing here is confusable with anything else, so the model never has to
 * remember an order.
 *
 * Several article ids in a row all attach to the change before them: one claim
 * commonly rests on the piece that broke it and the piece that corroborated
 * it, and there is no reason to make the model choose between them.
 */
export function parseEdits(args: string[]): facts.FactEdit[] {
  const edits: facts.FactEdit[] = [];
  // an id opens a change; the very next argument, if it is a line, is that
  // fact's new wording. A line further along belongs to no id and is new.
  let pending = false;

  for (const arg of args) {
    const token = arg.trim();
    if (!token) continue;

    const dropped = /^-\s*f\d+$/i.exec(token);
    if (dropped) {
      edits.push({ op: "drop", id: token.replace(/[-\s]/g, "").toLowerCase() });
      pending = false;
      continue;
    }

    if (/^f\d+$/i.test(token)) {
      edits.push({ op: "set", id: token.toLowerCase() });
      pending = true;
      continue;
    }

    if (/^\d+$/.test(token)) {
      const value = Number(token);
      const last = edits[edits.length - 1];
      pending = false;
      if (!last || last.op === "drop") continue;
      // the scale stops at 5, so anything bigger is the article it cites
      if (value <= facts.MAX_CONFIDENCE) last.confidence = value;
      else last.articleIds = [...(last.articleIds ?? []), value];
      continue;
    }

    const last = edits[edits.length - 1];
    if (pending && last?.op === "set") last.content = token;
    else edits.push({ op: "add", content: token });
    pending = false;
  }

  return edits;
}

/** Every line the call wrote, whether it reworded a fact or filed a new one. */
function written(edits: facts.FactEdit[]): string[] {
  return edits.flatMap((edit) =>
    edit.op !== "drop" && edit.content ? [edit.content] : [],
  );
}

/**
 * What the revision did, in the terms the analyst wrote it, and then the list
 * as it now stands — the analyst no longer holds the whole set in the call, so
 * the reply is where it sees what its change left behind.
 */
function summarize(
  before: facts.Fact[],
  version: facts.FactsVersion,
  edits: facts.FactEdit[],
): string {
  const kept = new Set(version.facts.map((f) => f.id));
  const dropped = before.filter((f) => !kept.has(f.id));
  const added = version.facts.filter((f) => !before.some((b) => b.id === f.id));
  const changed = edits.filter(
    (edit) => edit.op === "set" && kept.has(edit.id),
  ).length;

  const lines = version.facts.map(
    (f) => `- ${f.id} [${describe(f.confidence)}] ${f.content}`,
  );

  const notes = [
    changed > 0 ? `${changed} changed` : "",
    added.length > 0 ? `${added.length} new` : "",
    dropped.length > 0
      ? `deleted ${dropped.map((f) => `${f.id} "${f.content}"`).join(", ")}`
      : "",
  ].filter(Boolean);

  return [
    `Wrote version ${version.version}` +
      (notes.length > 0 ? `: ${notes.join("; ")}` : "") +
      `. The list now stands at ${version.facts.length} facts:`,
    "",
    lines.join("\n"),
  ]
    .filter(Boolean)
    .join("\n");
}

function describe(confidence: number): string {
  return `${confidence}/5 ${facts.CONFIDENCE_LABELS[confidence] ?? ""}`.trim();
}
