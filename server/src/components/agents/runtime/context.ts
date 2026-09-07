import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import * as predictions from "../../../models/predictions";
import * as stories from "../../../models/stories";
import * as dashboards from "../../../models/dashboards";
import { StoryFeedEntry } from "../../../api/types";
dayjs.extend(relativeTime);

export async function currentContext(dashboardId: string): Promise<string> {
  const [dashboard, feed, claims] = await Promise.all([
    dashboards.get(dashboardId),
    stories.feed(dashboardId, 100),
    predictions.forDashboard(dashboardId),
  ]);
  return dashboardContext(dashboard?.name ?? dashboardId, feed, claims);
}

export function dashboardContext(
  name: string,
  storyFeed: StoryFeedEntry[],
  claims: predictions.Prediction[],
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
    "",
    // The standing facts were written out here too, until GET_FACTS existed to
    // return them. A copy in the system message is a copy that stops moving: it
    // is stale the moment the analyst revises the list, and the ids it would
    // name from a stale copy are ids REVISE_FACTS refuses. One reachable list
    // cannot disagree with itself.
    predictionsContext(claims),
  ].join("\n");
}

/**
 * The open claims and where the odds stand. Only the current number and the
 * last reasoning: the whole history is on the reader's screen, and what the
 * analyst needs is what it thought last time, not every time.
 */
function predictionsContext(claims: predictions.Prediction[]): string {
  if (claims.length === 0) {
    return `The reader has made no predictions on this dashboard yet.`;
  }

  const lines = claims.map((claim) => {
    const odds =
      claim.likelihood === null
        ? "not yet forecast"
        : `${claim.likelihood}/5 ${
            predictions.LIKELIHOOD_LABELS[claim.likelihood]
          }`;
    const last = claim.forecasts[0];
    const because = last ? `\n  last moved because: ${last.reasoning}` : "";
    return `- #${claim.id} [${odds}] ${claim.content}${because}`;
  });

  return [
    `The reader's predictions for this dashboard, with where you last put the`,
    `odds — 1 highly unlikely to 5 highly likely. The ids are what FORECAST`,
    `takes.`,
    "",
    lines.join("\n"),
  ].join("\n");
}
