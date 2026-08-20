import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import * as facts from "../../models/facts";
import { StoryFeedEntry } from "../../api/types";

dayjs.extend(relativeTime);

export const establishFactsPrompt = (
  dashboard: string,
  storyFeed: StoryFeedEntry[],
  known: facts.FactWithSource[],
): string =>
  [
    `Today is ${dayjs().format("dddd, D MMMM YYYY")}.`,
    "",
    `Please read the latest stories for ${dashboard} and update the facts.`,
    "",
    storiesSection(storyFeed),
    "",
    knownSection(known),
  ].join("\n");

function storiesSection(storyFeed: StoryFeedEntry[]): string {
  if (storyFeed.length === 0) {
    return `Nothing has been filed under this dashboard yet, so there is nothing to read. Say so and stop.`;
  }

  const lines = storyFeed.map((story) => {
    const when = dayjs(story.updatedAt).fromNow();
    const count = story.articles.length;
    return `- ${story.title} (${count} article${count === 1 ? "" : "s"}, newest ${when})`;
  });

  return [
    `The stories filed under it, newest first. Those titles are exact — pass`,
    `one to GET_STORY to read the articles under it.`,
    "",
    lines.join("\n"),
  ].join("\n");
}

function knownSection(known: facts.FactWithSource[]): string {
  if (known.length === 0) {
    return `Nothing has been established as fact for this dashboard yet, so whatever you write is the first version.`;
  }

  const lines = known.map((fact) => {
    const label = facts.CONFIDENCE_LABELS[fact.confidence] ?? "";
    const source = fact.articleTitle ? `, from "${fact.articleTitle}"` : "";
    return `- ${fact.id} [${fact.confidence}/5 ${label}] ${fact.content}${source}`;
  });

  return [
    `What it is already taken to have established, newest first. These are the`,
    `ids REVISE_FACTS takes.`,
    "",
    lines.join("\n"),
  ].join("\n");
}
