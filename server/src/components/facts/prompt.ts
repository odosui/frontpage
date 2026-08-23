import dayjs from "dayjs";

/**
 * What one facts run is asked to do.
 *
 * The stories and the standing facts used to be written out here, both lists
 * in full, and the agent read them without calling anything. That put the two
 * things it reasons over into the task and left the tools describing a
 * database it had already been handed — so a run spent its context on stories
 * it was never going to open, and the fact ids it needed for REVISE_FACTS
 * arrived as prose rather than from the tool that defines them.
 *
 * Now the task says only what to do, and GET_STORIES and GET_FACTS say what is
 * there. The run pays for what it actually reads, the two lists cannot drift
 * from what the tools would return, and the same wording works for an arc with
 * three stories and one with three hundred.
 */
export const establishFactsPrompt = (dashboard: string): string =>
  [
    `Today is ${dayjs().format("dddd, D MMMM YYYY")}.`,
    "",
    `Please read the latest stories for ${dashboard} and update the facts.`,
    "",
    "Start by reading both sides of that: GET_STORIES for what has been filed",
    "here, newest first, and GET_FACTS for what the arc is already taken to",
    "have established. You need both before you can tell a new claim from one",
    "that is already on the list gathering its second source.",
    "",
    "Then open what looks like it moved something. GET_STORY takes a title",
    "from GET_STORIES exactly as it was given and returns the articles under",
    "it; READ_ARTICLE gives you the full text of any of them. A story title",
    "and an article count are not evidence — where a fact turns on what was",
    "actually reported, read it.",
    "",
    "The ids matter in both directions: the fact ids from GET_FACTS are what",
    "REVISE_FACTS edits in place, and the article ids from GET_STORY are what",
    "a fact comes to rest on.",
  ].join("\n");
