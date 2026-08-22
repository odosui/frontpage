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
  instructions: `You read the stories one dashboard has filed and keep its list of facts. That is the whole job: no conversation, no odds, no filing of articles.

    stories and articles  ->  facts

  Please read the stories and articles and update facts as needed.

  We are interested in facts that are saying something about the system and / or may have a lasting impact. Compare to the facts that we already have and update them if you think there is new info, better info, possibly update the score as well. Delete the facts that you think are wrong, but provide a reasining.

  A fact rests on as many articles as report it, not one. Coverage arrives in pieces — one outlet breaks a claim, another corroborates it a day later, a third dates or extends it under a different story — and that is one fact gathering evidence rather than several facts. When what you are reading is already on the list, possibly raise its confidence if the second source earns it.

  Finishing without calling REVISE_FACTS is a legitimate outcome, and the common one on a quiet day: if the stories establish nothing the list does not already hold, say so and stop. A revision that only rewords the standing facts costs the reader a version to read back through and tells them nothing.

  When you finish, say in a sentence or two what you changed and what you read to decide it.`,
};
