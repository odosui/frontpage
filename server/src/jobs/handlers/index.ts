import { JobHandler } from "../types";
import { extractArticlesHandler } from "./extractArticles";
import { fetchPageHandler } from "./fetchPage";
import { runAgentHandler } from "./runAgent";

export const handlers: Record<string, JobHandler> = {
  fetch_page: fetchPageHandler,
  extract_articles: extractArticlesHandler,
  run_agent: runAgentHandler,
};

export const JOB_TYPES = Object.keys(handlers);
