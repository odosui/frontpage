import * as storylines from "../../models/storylines";
import * as tags from "../../models/tags";
import { AgentDefinition, AgentTool } from "./types";

/** Keeps a runaway `<|GET_TAGS 100000|>` from dumping the whole table. */
const MAX_ROWS = 100;

function count(args: string[], fallback: number): number {
  const n = Number(args[0]);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), MAX_ROWS);
}

/** Compact lines, not JSON — the model reads these, and tokens cost money. */
const tools: AgentTool[] = [
  {
    name: "GET_STORYLINES",
    usage: "<|GET_STORYLINES 20|>",
    description:
      "The most recent storylines, newest first, with how many stories each holds. Use it before naming a new storyline.",
    run: async (args) => {
      const rows = await storylines.latest(count(args, 20));
      if (rows.length === 0) return "(no storylines yet)";
      return rows
        .map((s) => `#${s.id} ${s.title} — ${s.storyCount} stories`)
        .join("\n");
    },
  },
  {
    name: "GREP_STORYLINES",
    usage: '<|GREP_STORYLINES "iran" 10|>',
    description:
      "Storylines whose title contains the given text. Use it to check whether an arc already exists before starting one.",
    run: async (args) => {
      const term = args[0] ?? "";
      if (!term) return "ERROR: GREP_STORYLINES needs a search term.";
      const rows = await storylines.search(term, count(args.slice(1), 10));
      if (rows.length === 0) return `(no storyline matching "${term}")`;
      return rows
        .map((s) => `#${s.id} ${s.title} — ${s.storyCount} stories`)
        .join("\n");
    },
  },
  {
    name: "GET_TAGS",
    usage: "<|GET_TAGS 40|>",
    description:
      "The most-used tags with their article counts. Use it to reuse the established vocabulary instead of inventing near-duplicates.",
    run: async (args) => {
      const rows = await tags.popular(count(args, 40));
      if (rows.length === 0) return "(no tags yet)";
      return rows.map((t) => `${t.name} (${t.articleCount})`).join("\n");
    },
  },
  {
    name: "GREP_TAGS",
    usage: '<|GREP_TAGS "elect" 10|>',
    description:
      "Tags whose name contains the given text. Use it to find the exact existing spelling of a tag you are about to use.",
    run: async (args) => {
      const term = args[0] ?? "";
      if (!term) return "ERROR: GREP_TAGS needs a search term.";
      const rows = await tags.search(term, count(args.slice(1), 10));
      if (rows.length === 0) return `(no tag matching "${term}")`;
      return rows.map((t) => `${t.name} (${t.articleCount})`).join("\n");
    },
  },
];

export const categorizingAgent: AgentDefinition = {
  kind: "categorizing_agent",
  name: "CategorizingAgent",
  maxSteps: 12,
  tools,
  instructions: `You are a news desk editor. You are given a batch of fresh headlines and you
group them into stories, place those stories under storylines, and tag every
article.

  storyline   an ongoing narrative spanning weeks or months
                — "Russian-Ukrainian war", "AI chip race", "Bird flu outbreak"
    story     one specific event inside it
                — "Attack on Novorossiysk"
      article one headline from one outlet; several outlets covering the same
              event MUST be merged into a single story

Before you decide anything, look at what already exists. The database holds
storylines and tags from previous batches, and your job is to extend that
vocabulary, not to start a parallel one:

- Check for an existing storyline before you invent one. An event that belongs
  to a running arc must be filed under the arc already in the database, using
  its exact title.
- Check the existing tags before you tag. If "us election" is already in use,
  never write "U.S. elections" alongside it.

Look things up as often as you need to. When you have enough context, answer.`,
};
