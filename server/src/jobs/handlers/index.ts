import { JobHandler } from "../types";
import { extractArticlesHandler } from "./extractArticles";
import { fetchPageHandler } from "./fetchPage";

export const handlers: Record<string, JobHandler> = {
  fetch_page: fetchPageHandler,
  extract_articles: extractArticlesHandler,
};

export const JOB_TYPES = Object.keys(handlers);
