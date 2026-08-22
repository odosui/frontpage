import * as stories from "../../../models/stories";
import { AgentTool } from "../types";
import { count } from "./utils/args";

/** Enough to see the whole of an ordinary story without flooding the turn. */
const DEFAULT_ARTICLES = 50;

/** The rung below GET_STORIES: one story, opened up into its articles. */
export const getStory: AgentTool = {
  name: "GET_STORY",
  usage: '<|GET_STORY "Drone attack sets Wildberries warehouse ablaze" 50|>',
  description:
    "One story's articles, newest first: headline, source, the date it was published, how important the categorizer thought it was, its tags, and its id. Up to 50 unless you ask for a different number. " +
    "GET_STORIES only tells you a story exists and how many articles are under it — this is how you find out what they actually say. " +
    "Use it before answering anything about what was reported, and use the ids it gives you with READ_ARTICLE when a headline is not enough. " +
    "'not read yet' is not a refusal — READ_ARTICLE will fetch the page; it just costs a moment longer than one already stored.",
  run: async (args, ctx) => {
    const title = args[0] ?? "";
    if (!title) return "ERROR: GET_STORY needs a story title.";

    const found = await stories.detail(
      ctx.dashboardId,
      title,
      count(args.slice(1), DEFAULT_ARTICLES),
    );
    if (!found) return `(no story matching "${title}")`;

    const { story, totalArticles } = found;
    if (story.articles.length === 0) return `${story.title} — (no articles)`;

    const head = story.title;
    const shown =
      story.articles.length < totalArticles
        ? `\n(${story.articles.length} most recent of ${totalArticles} articles)`
        : "";

    return [
      head + shown,
      ...story.articles.map((a) => {
        const bits = [
          `#${a.id}`,
          a.sourceId,
          (a.publishedAt ?? a.createdAt).slice(0, 10),
          a.importance === null ? "unscored" : `importance ${a.importance}/10`,
          a.hasContent ? "full text stored" : "not read yet",
        ];
        const tags = a.tags.length > 0 ? `\n  tags: ${a.tags.join(", ")}` : "";
        return `- ${a.title}\n  ${bits.join(" · ")}${tags}`;
      }),
    ].join("\n");
  },
};
