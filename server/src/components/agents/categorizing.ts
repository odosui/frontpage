import { getStories } from "./tools/getStories";
import { getStorylines } from "./tools/getStorylines";
import { getTags } from "./tools/getTags";
import { grepStories } from "./tools/grepStories";
import { grepStorylines } from "./tools/grepStorylines";
import { grepTags } from "./tools/grepTags";
import { AgentDefinition } from "./types";

export const categorizingAgent: AgentDefinition = {
  kind: "categorizing_agent",
  name: "CategorizingAgent",
  maxSteps: 12,
  tools: [
    getStorylines,
    grepStorylines,
    getStories,
    grepStories,
    getTags,
    grepTags,
  ],
  instructions: `You are given a batch of fresh headlines — some carrying the outlet's own
summary, some not — and you group them into stories, place those stories under
storylines, and tag every article.

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
- Check whether the event already has a story before you write a new title. A
  batch only ever holds part of the day's coverage, so the same event often
  arrived in an earlier run. Once you know which storyline an article belongs
  to, list the stories under that storyline and read them — that is the
  reliable check, because an earlier run may have worded the event differently
  than you would search for it. If the event is there, reuse that story's exact
  title so this article joins it instead of starting a near duplicate beside it.

Look things up as often as you need to. When you have enough context, answer.`,
};
