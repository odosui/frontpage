import { JobHandler } from "../types";
import { analyzePageHandler } from "./analyzePage";
import { fetchPageHandler } from "./fetchPage";

export const handlers: Record<string, JobHandler> = {
  fetch_page: fetchPageHandler,
  analyze_page: analyzePageHandler,
};

export const JOB_TYPES = Object.keys(handlers);
