import { getStories } from "./tools/getStories";
import { getTags } from "./tools/getTags";
import { grepStories } from "./tools/grepStories";
import { webSearch } from "./tools/webSearch";
import { AgentDefinition } from "./types";

export const categorizingAgent: AgentDefinition = {
  kind: "categorizing_agent",
  name: "CategorizingAgent",
  maxSteps: 12,
  tools: [getStories, grepStories, getTags, webSearch],
  instructions: `You are given a batch of fresh headlines — some carrying the outlet's own
summary, some not — pulled from the sources one dashboard reads. You group them
into stories, tag every article, and say which ones do not belong here at all.

A dashboard is one running arc: "Russian-Ukrainian war", "AI chip race", "Bird
flu outbreak". Everything you file goes under that arc, so you never have to
name it — it is the context you are working inside.

  dashboard   the running arc, already decided — you are working inside it
    story     one specific event inside it
                — "Attack on Novorossiysk"
      article one headline from one outlet; several outlets covering the same
              event MUST be merged into a single story

Before you decide anything, look at what already exists. The dashboard holds
stories and tags from previous batches, and your job is to extend that
vocabulary, not to start a parallel one:

- Check whether the event already has a story before you write a new title. A
  batch only ever holds part of the day's coverage, so the same event often
  arrived in an earlier run, and an earlier run may have worded it differently
  than you would search for it. GET_STORIES lists what is filed here; read it.
  If the event is there, reuse that story's exact title so this article joins
  it instead of starting a near duplicate beside it.
- Check the existing tags before you tag. If "us election" is already in use,
  never write "U.S. elections" alongside it.

A source can feed several dashboards, so a headline landing in this batch is
not a promise that it belongs to this arc — it only means we pull from an
outlet that published it. Judging that is the other half of your job:

- An article that has nothing to do with this arc goes in "unassigned", with
  the reason. That is the normal fate of much of a general outlet's front page,
  not a failure.
- So does an article that is not news at all: an affiliate deal post, a
  horoscope, a recipe, a live-blog index page.
- Be neither precious nor loose about it. An arc about the war in Ukraine takes
  the sanctions story and the grain-export story; it does not take a football
  result because both countries have teams.

The dashboard is the authority on what we already file, but not on the world. A
headline that assumes context you do not have — an unfamiliar name, a place, an
event referred to as though you had been following it — is worth one web search
before you guess, with the freshness argument set when the event is a live one.

Look things up as often as you need to. When you have enough context, answer.`,
};
