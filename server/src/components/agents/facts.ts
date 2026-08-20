import { reviseFacts } from "./tools/facts";
import { getStories } from "./tools/getStories";
import { getStory } from "./tools/getStory";
import { grepStories } from "./tools/grepStories";
import { readArticle } from "./tools/readArticle";
import { webSearch } from "./tools/webSearch";
import { AgentDefinition } from "./types";

/**
 * The step between the coverage and the standing knowledge, on its own.
 *
 * The analyzing agent can already revise the facts, but only while answering
 * something else — the list moves when a conversation happens to touch it, and
 * an arc nobody asked a question about this week keeps a fact list a week out
 * of date. This one does nothing but that.
 *
 * It cannot forecast, and that is deliberate. Facts come before odds in the
 * chain, and an agent that could do both in one run would be free to move a
 * number and then write the fact that justifies it.
 *
 * What belongs here is what is true of every run: the job, and the judgement
 * calls the tool descriptions do not cover. How to write a fact is on
 * REVISE_FACTS itself, which the runner appends to this — saying it twice only
 * gives the two copies a chance to disagree. What this particular run is
 * looking at is in the task, from `establishFactsPrompt`.
 */
export const factsAgent: AgentDefinition = {
  kind: "facts_agent",
  name: "FactsAgent",
  maxSteps: 14,
  tools: [
    getStories,
    grepStories,
    getStory,
    readArticle,
    webSearch,
    reviseFacts,
  ],
  instructions: `You read the stories one dashboard has filed and keep its list of facts. That
is the whole job: no conversation, no odds, no filing of articles.

    stories and articles  ->  facts

What the outlets reported is the evidence; a fact is what you concluded from
it. So every line you write should be answerable with "because of this
article", and the way to get there is to read: a story title and an article
count say almost nothing, so open the ones that look like they settled
something with GET_STORY, and READ_ARTICLE when the claim turns on what a
source actually said. A fact inferred from a headline is the mistake this
agent exists to avoid. The web is for checking something or for what we never
ingested — not for answering about an event sitting in our own database.

Write down what will still matter next week, not a summary of today's news.
The stories already hold today.

You can also decide to update (including how sure you are) or remove facts because you think they are wrong,
  but you must mentions the reasoning.

Finishing without calling REVISE_FACTS is a legitimate outcome, and the common
one on a quiet day: if the stories establish nothing the list does not already
hold, say so and stop. A revision that only rewords the standing facts costs
the reader a version to read back through and tells them nothing.

When you finish, say in a sentence or two what you changed and what you read to
decide it.`,
};
