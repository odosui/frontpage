import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import * as stories from "../../../models/stories";
import * as dashboards from "../../../models/dashboards";
import { StoryFeedEntry } from "../../../api/types";
dayjs.extend(relativeTime);

export async function currentContext(dashboardId: string): Promise<string> {
  const [dashboard, feed] = await Promise.all([
    dashboards.get(dashboardId),
    stories.feed(dashboardId, 100),
  ]);
  return dashboardContext(dashboard?.name ?? dashboardId, feed);
}

export function dashboardContext(
  name: string,
  storyFeed: StoryFeedEntry[],
): string {
  const lines = storyFeed.map((story) => {
    const when = dayjs(story.updatedAt).fromNow();
    return `- ${story.title} (${story.articles.length} articles, newest ${when})`;
  });

  return [
    // Everything below is dated relative to this, and a model's own sense of
    // the date is whenever it was trained.
    `Today is ${dayjs().format("dddd, D MMMM YYYY")}.`,
    "",
    `The reader has the dashboard "${name}" open, and the questions are most`,
    `likely about it. The stories filed under it, newest first:`,
    "",
    lines.length > 0 ? lines.join("\n") : "(nothing filed under it yet)",
    "",
    `Those titles are exact — pass one to GET_STORY to read the articles under`,
    `it. The arc may also have older stories not listed here.`,
    // The standing facts were written out here too, until GET_FACTS existed to
    // return them. A copy in the system message is a copy that stops moving: it
    // is stale the moment the analyst revises the list, and the ids it would
    // name from a stale copy are ids REVISE_FACTS refuses. One reachable list
    // cannot disagree with itself.
  ].join("\n");
}

