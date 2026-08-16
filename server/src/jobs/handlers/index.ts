import { JobHandler } from "../types";
import { extractArticlesHandler } from "./extractArticles";
import { fetchFeedHandler } from "./fetchFeed";
import { fetchPageHandler } from "./fetchPage";
import { runAgentHandler } from "./runAgent";

export const handlers: Record<string, JobHandler> = {
  fetch_page: fetchPageHandler,
  fetch_feed: fetchFeedHandler,
  extract_articles: extractArticlesHandler,
  run_agent: runAgentHandler,
};

export const JOB_TYPES = Object.keys(handlers);
