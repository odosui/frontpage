import { JobHandler } from "../types";
import { analyzePageHandler } from "./analyzePage";
import { fetchPageHandler } from "./fetchPage";

/**
 * Every job type the worker knows how to run. Add new ones here — a job whose
 * type is missing from this map fails loudly rather than sitting in the queue.
 */
export const handlers: Record<string, JobHandler> = {
  fetch_page: fetchPageHandler,
  analyze_page: analyzePageHandler,
};

export const JOB_TYPES = Object.keys(handlers);
