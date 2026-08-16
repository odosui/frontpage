import { fetchAndStore } from "../../articles/store";
import * as articles from "../../../models/articles";
import { AgentTool } from "../types";

/**
 * Long enough to reason from, short enough that reading three articles does not
 * fill the conversation. The stored text is the whole page, and the part that
 * answers a question is almost always near the top.
 */
const MAX_CHARS = 6000;

export const readArticle: AgentTool = {
  name: "READ_ARTICLE",
  usage: "<|READ_ARTICLE 4821|>",
  description:
    "The article's own text — the id comes from GET_STORY. " +
    "Articles GET_STORY marks 'headline only' have never been read, so this fetches the page and stores it, can fail on a paywall — 'full text stored' ones come straight back. ",
  run: async (args, ctx) => {
    const id = Number(args[0]);
    if (!Number.isFinite(id)) {
      return "ERROR: READ_ARTICLE needs an article id, as a number.";
    }

    const article = await articles.byId(ctx.dashboardId, id);
    if (!article) return `(no article #${id} in this dashboard)`;

    const head = `${article.title}\n${article.url}\n${article.channelId}`;
    const stored = await articles.contentOf(ctx.dashboardId, id);
    if (stored) {
      return `${head} · read ${stored.contentAt.slice(0, 10)}\n\n${cap(stored.content)}`;
    }

    // Never read before, so read it now. A page that will not give up its text
    // is an answer about that article — the agent should say the source is
    // unreadable rather than treat the tool as broken.
    try {
      const fetched = await fetchAndStore(ctx.dashboardId, id);
      if (!fetched.text.trim()) {
        return `${head}\n\n(the page was fetched but carried no readable text)`;
      }
      return `${head} · just fetched\n\n${cap(fetched.text)}`;
    } catch (e) {
      return `${head}\n\n(could not read the page: ${(e as Error).message})`;
    }
  },
};

function cap(text: string): string {
  return text.length > MAX_CHARS
    ? `${text.slice(0, MAX_CHARS)}\n… (truncated)`
    : text;
}
