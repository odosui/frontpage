import { JobHandler } from "../types";
import { agentReplyHandler } from "./agentReply";
import { extractArticlesHandler } from "./extractArticles";
import { extractContentHandler } from "./extractContent";
import { fetchFeedHandler } from "./fetchFeed";
import { fetchPageHandler } from "./fetchPage";
import { fetchRedditHandler } from "./fetchReddit";
import { runAgentHandler } from "./runAgent";
import { runFactsHandler } from "./runFacts";

export const handlers: Record<string, JobHandler> = {
  fetch_page: fetchPageHandler,
  fetch_feed: fetchFeedHandler,
  fetch_reddit: fetchRedditHandler,
  extract_articles: extractArticlesHandler,
  extract_content: extractContentHandler,
  run_agent: runAgentHandler,
  run_facts: runFactsHandler,
  agent_reply: agentReplyHandler,
};

export const JOB_TYPES = Object.keys(handlers);
