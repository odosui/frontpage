import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import * as queue from "../jobs/queue";
import { JOB_STATUSES, JobStatus } from "../jobs/types";
import { AGENT_KINDS, getAgent } from "../components/agents/registry";
import { factsAgent } from "../components/agents/facts";
import { startChat } from "../components/agents/chat";
import { BIG_MODEL } from "../components/ai/models";
import { DEFAULT_WINDOW_DAYS } from "../components/stories/categorize";
import { DEFAULT_MIN_SCORE } from "../components/reddit/parse";
import * as agentSessions from "../models/agentSessions";
import * as articles from "../models/articles";
import * as dashboards from "../models/dashboards";
import * as facts from "../models/facts";
import * as predictions from "../models/predictions";
import * as proposals from "../models/proposals";
import * as sources from "../models/sources";
import * as stories from "../models/stories";
import { error, ok } from "./helpers";
import * as stats from "./stats";
import {
  SOURCE_KINDS,
  SourceConfig,
  SourceKind,
  StoryFeedEntry,
} from "./types";

dayjs.extend(relativeTime);

const MAX_ITEMS = 100;
const MAX_STORIES = 50;

/** Which job reads each kind of source; a kind with none cannot be fetched. */
const FETCHERS: Partial<Record<SourceKind, string>> = {
  web: "fetch_page",
  rss: "fetch_feed",
  reddit: "fetch_reddit",
};

export const createApi = async () => {
  await dashboards.ensureDefaultDashboard();

  return {
    health: () => ok({ status: "ok" }),

    // Sources

    listSources: async () => ok({ sources: await sources.all() }),

    createSource: async (body: {
      name?: string;
      kind?: string;
      url?: string;
      config?: SourceConfig;
    }) => {
      const created = await makeSource(body);
      if ("error" in created) return created.error;
      return ok({ source: created.source });
    },

    updateSource: async (
      id: string,
      body: { name?: string; kind?: string; url?: string; config?: SourceConfig },
    ) => {
      const existing = await sources.get(id);
      if (!existing) return error(404, "source not found");

      const kind = (body.kind ?? existing.kind) as SourceKind;
      if (!SOURCE_KINDS.includes(kind)) {
        return error(400, `kind must be one of ${SOURCE_KINDS.join(", ")}`);
      }
      const name = (body.name ?? existing.name).trim();
      if (!name) return error(400, "name is required");
      const url = (body.url ?? existing.url).trim();
      if (!url) return error(400, "url is required");

      // a config left out is the one already stored, not an empty one
      const config = configFor(kind, body.config ?? existing.config);
      if ("error" in config) return config.error;

      return ok({
        source: await sources.upsert({ id, name, kind, url, config: config.config }),
      });
    },

    /**
     * Deletes the source outright, taking its articles — and therefore every
     * dashboard's filings over them — with it. Unassigning is the gentler
     * thing, and lives under the dashboard.
     */
    deleteSource: async (id: string) => {
      if (!id) return error(400, "source id is required");
      if (!(await sources.remove(id))) return error(404, "source not found");
      return ok({ success: true });
    },

    /**
     * Queues the work rather than doing it — the worker picks up fetch_page,
     * which chains into extract_articles. Fetched once however many dashboards
     * are reading it; clients follow progress via /api/jobs.
     */
    refreshSource: async (id: string) => {
      if (!id) return error(400, "source id is required");
      const source = await sources.get(id);
      if (!source) return error(404, "source not found");
      if (!source.url) return error(400, "source has no url configured");

      // a feed and a subreddit both say what their articles are, so they skip
      // the page-analysis chain entirely and go straight to a single
      // parse-and-store job. Only a web page needs a model to read it.
      const type = FETCHERS[source.kind] ?? null;
      if (!type) {
        return error(400, `${source.kind} sources cannot be fetched yet`);
      }

      const job = await queue.enqueue({
        type,
        payload: { sourceId: id, url: source.url },
      });
      console.log(`[refresh] ${id} queued as job ${job.id}`);

      return ok({ job });
    },

    // Dashboards

    listDashboards: async () => ok({ dashboards: await dashboards.listAll() }),

    createDashboard: async (body: { name: string }) => {
      if (!body.name || typeof body.name !== "string") {
        return error(400, "name is required");
      }
      const name = body.name.trim();
      const id = dashboards.idFor(name);
      if (!id) return error(400, "invalid name");
      if (await dashboards.exists(id)) {
        return error(409, "dashboard already exists");
      }
      return ok({ dashboard: await dashboards.create(id, name) });
    },

    deleteDashboard: async (id: string) => {
      if (!id || dashboards.isDefault(id)) {
        return error(400, "cannot delete default dashboard");
      }
      if (!(await dashboards.exists(id))) {
        return error(404, "dashboard not found");
      }
      await dashboards.remove(id);
      return ok({ success: true });
    },

    /**
     * Only the display name moves. The id is the url the reader may have kept
     * and the key every story, fact and prediction hangs off.
     */
    renameDashboard: async (id: string, body: { name: string }) => {
      if (!id) return error(400, "dashboard id is required");
      if (!body.name || typeof body.name !== "string") {
        return error(400, "name is required");
      }
      const name = body.name.trim();
      if (!name) return error(400, "invalid name");

      const renamed = await dashboards.rename(id, name);
      if (!renamed) return error(404, "dashboard not found");
      return ok({ dashboard: renamed });
    },

    /**
     * The whole arc, as the page renders it: its stories, what they are taken
     * to establish, what they point to, the sources feeding it and the latest
     * headlines off them.
     */
    getDashboard: async (dashboardId: string) => {
      const id = dashboards.resolveId(dashboardId);
      const dashboard = await dashboards.get(id);
      if (!dashboard) return error(404, "dashboard not found");

      const [assigned, feed, storyFeed, known, claims, uncategorized] =
        await Promise.all([
          sources.forDashboard(id),
          articles.feed(id, MAX_ITEMS),
          stories.feed(id, MAX_STORIES),
          facts.current(id),
          predictions.forDashboard(id),
          articles.uncategorizedCount(id, DEFAULT_WINDOW_DAYS),
        ]);

      return ok({
        dashboard,
        sources: assigned,
        feed,
        stories: storyFeed,
        facts: known?.facts ?? [],
        // which revision the page is looking at, so the history panel can say
        // so without a second request on every load
        factsVersion: known?.version ?? 0,
        predictions: claims,
        uncategorized,
      });
    },

    getFeed: async (dashboardId: string) => {
      const id = dashboards.resolveId(dashboardId);
      const [feed, uncategorized] = await Promise.all([
        articles.feed(id, MAX_ITEMS),
        articles.uncategorizedCount(id, DEFAULT_WINDOW_DAYS),
      ]);
      return ok({ feed, uncategorized });
    },

    /** The categorized view: stories with their articles, newest story first. */
    getStories: async (dashboardId: string) => {
      const id = dashboards.resolveId(dashboardId);
      return ok({ stories: await stories.feed(id, MAX_STORIES) });
    },

    renameStory: async (
      dashboardId: string,
      storyId: string,
      body: { title?: string },
    ) => {
      const id = dashboards.resolveId(dashboardId);
      const numeric = Number(storyId);
      if (!Number.isFinite(numeric)) {
        return error(400, "story id must be a number");
      }
      const title = (body?.title ?? "").trim();
      if (!title) return error(400, "title is required");

      if (!(await stories.rename(id, numeric, title))) {
        return error(404, "story not found");
      }
      return ok({ stories: await stories.feed(id, MAX_STORIES) });
    },

    /** Unfiles the story; its articles go back into the dashboard's queue. */
    deleteStory: async (dashboardId: string, storyId: string) => {
      const id = dashboards.resolveId(dashboardId);
      const numeric = Number(storyId);
      if (!Number.isFinite(numeric)) {
        return error(400, "story id must be a number");
      }
      if (!(await stories.remove(id, numeric))) {
        return error(404, "story not found");
      }
      return ok({ stories: await stories.feed(id, MAX_STORIES) });
    },

    // A dashboard's sources

    listDashboardSources: async (dashboardId: string) => {
      const id = dashboards.resolveId(dashboardId);
      return ok({ sources: await sources.forDashboard(id) });
    },

    /**
     * Points this dashboard at a source: an existing one by `sourceId`, or a
     * new one described inline. Creating and assigning in one call is what
     * "add a source" means from inside a dashboard, and it is the only place
     * the two are combined.
     */
    assignSource: async (
      dashboardId: string,
      body: { sourceId?: string; name?: string; kind?: string; url?: string },
    ) => {
      const id = dashboards.resolveId(dashboardId);
      if (!(await dashboards.exists(id))) {
        return error(404, "dashboard not found");
      }

      let sourceId = (body?.sourceId ?? "").trim();
      if (sourceId) {
        if (!(await sources.get(sourceId))) return error(404, "source not found");
      } else {
        const created = await makeSource(body);
        if ("error" in created) return created.error;
        sourceId = created.source.id;
      }

      await sources.assign(id, sourceId);
      return ok({ sources: await sources.forDashboard(id) });
    },

    /**
     * Stops this dashboard reading a source. The source and its articles stay
     * — another dashboard may be reading them, and even where none is,
     * unassigning is not deleting.
     */
    unassignSource: async (dashboardId: string, sourceId: string) => {
      const id = dashboards.resolveId(dashboardId);
      if (!sourceId) return error(400, "source id is required");
      if (!(await sources.unassign(id, sourceId))) {
        return error(404, "this dashboard does not read that source");
      }
      return ok({ sources: await sources.forDashboard(id) });
    },

    // Predictions

    /**
     * The reader writes the claim; the likelihood is left alone. Putting a
     * number on it is the analyst's job, through FORECAST.
     */
    createPrediction: async (
      dashboardId: string,
      body: { content?: string },
    ) => {
      const id = dashboards.resolveId(dashboardId);
      const content = (body?.content ?? "").trim();
      if (!content) return error(400, "content is required");
      if (!(await dashboards.exists(id))) {
        return error(404, "dashboard not found");
      }

      return ok({ prediction: await predictions.create(id, content) });
    },

    updatePrediction: async (
      dashboardId: string,
      predictionId: string,
      body: { content?: string },
    ) => {
      const id = dashboards.resolveId(dashboardId);
      const numeric = Number(predictionId);
      if (!Number.isFinite(numeric)) {
        return error(400, "prediction id must be a number");
      }
      const content = (body?.content ?? "").trim();
      if (!content) return error(400, "content is required");

      const updated = await predictions.updateContent(id, numeric, content);
      if (!updated) return error(404, "prediction not found");
      return ok({ prediction: updated });
    },

    deletePrediction: async (dashboardId: string, predictionId: string) => {
      const id = dashboards.resolveId(dashboardId);
      const numeric = Number(predictionId);
      if (!Number.isFinite(numeric)) {
        return error(400, "prediction id must be a number");
      }

      if (!(await predictions.remove(id, numeric))) {
        return error(404, "prediction not found");
      }
      return ok({ success: true });
    },

    // Facts

    /** Every past version of this arc's facts, newest first, with its reasoning. */
    getFactsHistory: async (dashboardId: string) => {
      const id = dashboards.resolveId(dashboardId);
      return ok({ versions: await facts.history(id) });
    },

    /**
     * The reader's own edits, one fact at a time as the pane presents them.
     * Each still writes a whole version — the row is the set, not the line —
     * so the list is read back, changed, and written on as the next one.
     */
    createFact: async (
      dashboardId: string,
      body: { content?: string; confidence?: number; articleId?: number | null },
    ) => {
      const content = (body?.content ?? "").trim();
      if (!content) return error(400, "content is required");

      return reviseFacts(dashboardId, (current) => [
        ...current,
        {
          content,
          ...(body.confidence !== undefined
            ? { confidence: Number(body.confidence) }
            : {}),
          ...(body.articleId !== undefined ? { articleId: body.articleId } : {}),
        },
      ]);
    },

    updateFact: async (
      dashboardId: string,
      factId: string,
      body: { content?: string; confidence?: number; articleId?: number | null },
    ) => {
      const content = body?.content?.trim();
      if (content !== undefined && !content) {
        return error(400, "content cannot be emptied");
      }

      return reviseFacts(dashboardId, (current) => {
        if (!current.some((fact) => fact.id === factId)) return null;
        return current.map((fact) =>
          fact.id === factId
            ? {
                ...fact,
                ...(content !== undefined ? { content } : {}),
                ...(body?.confidence !== undefined
                  ? { confidence: Number(body.confidence) }
                  : {}),
                ...(body?.articleId !== undefined
                  ? { articleId: body.articleId }
                  : {}),
              }
            : fact,
        );
      });
    },

    deleteFact: async (dashboardId: string, factId: string) => {
      return reviseFacts(dashboardId, (current) => {
        if (!current.some((fact) => fact.id === factId)) return null;
        return current.filter((fact) => fact.id !== factId);
      });
    },

    // Articles

    /**
     * Queues a read of one article's page. Queued rather than done inline so a
     * slow site cannot hold the request open, and so the ui follows it through
     * the same jobs poll as everything else.
     */
    extractArticleContent: async (dashboardId: string, articleId: string) => {
      const id = dashboards.resolveId(dashboardId);
      const numeric = Number(articleId);
      if (!Number.isInteger(numeric) || numeric <= 0) {
        return error(400, "a numeric article id is required");
      }

      const article = await articles.byId(numeric);
      if (!article || !(await articles.isVisibleTo(id, numeric))) {
        return error(404, "article not found");
      }

      const job = await queue.enqueue({
        type: "extract_content",
        payload: { articleId: numeric, url: article.url },
      });
      console.log(`[content] article ${numeric} queued as job ${job.id}`);

      return ok({ job });
    },

    /** The stored text, or a 404 if nothing has read this article yet. */
    getArticleContent: async (dashboardId: string, articleId: string) => {
      const id = dashboards.resolveId(dashboardId);
      const numeric = Number(articleId);
      if (!Number.isInteger(numeric) || numeric <= 0) {
        return error(400, "a numeric article id is required");
      }

      const article = await articles.byId(numeric);
      if (!article || !(await articles.isVisibleTo(id, numeric))) {
        return error(404, "article not found");
      }

      const stored = await articles.contentOf(numeric);
      if (!stored) return error(404, "this article has not been read yet");

      return ok({
        title: article.title,
        url: article.url,
        sourceId: article.sourceId,
        ...stored,
      });
    },

    // Jobs

    listJobs: async (params: { status?: string; limit?: string }) => {
      const status = params.status;
      if (status && !JOB_STATUSES.includes(status as JobStatus)) {
        return error(400, `status must be one of ${JOB_STATUSES.join(", ")}`);
      }
      const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200);
      const [jobs, counts] = await Promise.all([
        queue.list({ status: status as JobStatus | undefined, limit }),
        queue.stats(),
      ]);
      return ok({ jobs, stats: counts });
    },

    jobStats: async () => ok({ stats: await queue.stats() }),

    // Agents

    listAgents: async () =>
      ok({
        agents: AGENT_KINDS.map((kind) => {
          const agent = getAgent(kind);
          return {
            kind: agent.kind,
            name: agent.name,
            tools: agent.tools.map((t) => ({
              name: t.name,
              usage: t.usage,
              description: t.description,
            })),
          };
        }),
      }),

    listAgentSessions: async (
      dashboardId: string,
      params: { kind?: string; limit?: string },
    ) => {
      const id = dashboards.resolveId(dashboardId);
      const limit = Math.min(Math.max(Number(params.limit) || 30, 1), 200);
      return ok({ sessions: await agentSessions.list(id, params.kind, limit) });
    },

    /** The session plus its whole transcript — what the ui polls while it runs. */
    getAgentSession: async (id: string) => {
      const sessionId = Number(id);
      if (!Number.isFinite(sessionId)) {
        return error(400, "session id must be a number");
      }
      const session = await agentSessions.get(sessionId);
      if (!session) return error(404, "session not found");
      const [messages, pending] = await Promise.all([
        agentSessions.messages(sessionId),
        proposals.forSession(sessionId),
      ]);
      return ok({ session, messages, proposals: pending });
    },

    /**
     * Carries out something the agent asked for. This is where an agent's
     * write actually happens — on the reader's click, against the ids the
     * proposal was written with, never on the agent's own say-so.
     */
    decideProposal: async (id: string, body: { approve?: boolean }) => {
      const proposalId = Number(id);
      if (!Number.isFinite(proposalId)) {
        return error(400, "proposal id must be a number");
      }

      const existing = await proposals.get(proposalId);
      if (!existing) return error(404, "proposal not found");
      if (existing.status !== "pending") {
        return error(409, `this proposal was already ${existing.status}`);
      }

      if (!body?.approve) {
        const rejected = await proposals.reject(proposalId);
        await tellTheAgent(
          existing,
          `Proposal #${proposalId} was declined by the reader. Nothing was ` +
            `changed. Do not propose it again unless they ask.`,
        );
        return ok({ proposal: rejected });
      }

      // Claimed first: the click that wins is the one that does the work, so a
      // double click cannot merge twice.
      const claimed = await proposals.claim(proposalId);
      if (!claimed) return error(409, "this proposal was already decided");

      try {
        const result = await carryOut(claimed);
        await tellTheAgent(
          claimed,
          `Proposal #${proposalId} was approved by the reader and has been ` +
            `carried out: ${describe(claimed, result)}`,
        );
        return ok({ proposal: await proposals.succeeded(proposalId, result) });
      } catch (e) {
        const message = (e as Error).message;
        await tellTheAgent(
          claimed,
          `Proposal #${proposalId} was approved but could not be carried ` +
            `out: ${message}. Nothing was changed.`,
        );
        return ok({ proposal: await proposals.failed(proposalId, message) });
      }
    },

    /**
     * Queues an agent run rather than running it here: the worker does the work
     * and writes each turn as it happens, so the ui can watch it unfold.
     */
    runAgent: async (dashboardId: string, body: { kind?: string }) => {
      const id = dashboards.resolveId(dashboardId);
      const kind = body?.kind || "";
      if (!AGENT_KINDS.includes(kind)) {
        return error(400, `kind must be one of ${AGENT_KINDS.join(", ")}`);
      }
      if (!(await dashboards.exists(id))) {
        return error(404, "dashboard not found");
      }
      // the kind decides the job, because the kinds are not interchangeable
      // runs: `run_agent` hands the model a batch of unfiled articles and
      // persists the tree it answers with, which is meaningless to an agent
      // whose work is done through its own tools
      const job = await queue.enqueue(
        kind === factsAgent.kind
          ? { type: "run_facts", payload: { dashboardId: id } }
          : { type: "run_agent", payload: { kind, dashboardId: id } },
      );
      return ok({ job });
    },

    /**
     * Opens a conversation with an agent. Only the system message is written
     * here — nothing is asked until the first message arrives, so opening a
     * chat and never using it costs no model call.
     */
    startChat: async (dashboardId: string, body: { kind?: string }) => {
      const id = dashboards.resolveId(dashboardId);
      const kind = body?.kind || "";
      if (!AGENT_KINDS.includes(kind)) {
        return error(400, `kind must be one of ${AGENT_KINDS.join(", ")}`);
      }
      const dashboard = await dashboards.get(id);
      if (!dashboard) return error(404, "dashboard not found");

      // The arc as the reader has it on screen, written into the system
      // message: the first question is nearly always about something already
      // there, and a turn spent looking it up is a turn they wait through for
      // nothing.
      const [storyFeed, known, claims] = await Promise.all([
        stories.feed(id, MAX_STORIES),
        facts.forDashboard(id),
        predictions.forDashboard(id),
      ]);

      const { sessionId } = await startChat(getAgent(kind), {
        model: BIG_MODEL,
        dashboardId: id,
        context: dashboardContext(dashboard.name, storyFeed, known, claims),
      });
      return ok({ session: await agentSessions.get(sessionId) });
    },

    /**
     * Asks the agent something. The turn itself runs in the worker, so this
     * answers as soon as the question is queued and the ui watches the
     * transcript for the reply.
     */
    sendChatMessage: async (id: string, body: { content?: string }) => {
      const sessionId = Number(id);
      if (!Number.isFinite(sessionId)) {
        return error(400, "session id must be a number");
      }
      const content = (body?.content ?? "").trim();
      if (!content) return error(400, "content is required");

      const session = await agentSessions.get(sessionId);
      if (!session) return error(404, "session not found");

      const job = await queue.enqueue({
        type: "agent_reply",
        payload: { sessionId, question: content },
        // a question nobody can answer twice: a retried turn would ask the
        // model the same thing again and append a second reply
        maxAttempts: 1,
      });
      return ok({ job });
    },

    // Settings

    databaseStats: async () => ok({ stats: await stats.collect() }),
  };
};

export type Api = Awaited<ReturnType<typeof createApi>>;

/**
 * Validates a source described inline and writes it. Shared by the two ways
 * one gets made: on its own from the settings page, and alongside an
 * assignment from inside a dashboard.
 */
async function makeSource(
  body:
    | { name?: string; kind?: string; url?: string; config?: SourceConfig }
    | undefined,
): Promise<
  | { source: Awaited<ReturnType<typeof sources.upsert>> }
  | { error: ReturnType<typeof error> }
> {
  const name = (body?.name ?? "").trim();
  if (!name) return { error: error(400, "name is required") };

  const url = (body?.url ?? "").trim();
  if (!url) return { error: error(400, "url is required") };

  const kind = (body?.kind || "web") as SourceKind;
  if (!SOURCE_KINDS.includes(kind)) {
    return { error: error(400, `kind must be one of ${SOURCE_KINDS.join(", ")}`) };
  }

  const config = configFor(kind, body?.config);
  if ("error" in config) return { error: config.error };

  // the name is the id, so two sources cannot silently share one
  const id = name;
  if (await sources.get(id)) {
    return { error: error(409, `a source called "${id}" already exists`) };
  }

  return { source: await sources.upsert({ id, name, kind, url, config: config.config }) };
}

/**
 * The settings that mean something for this kind, validated. Anything a kind
 * does not read is dropped rather than stored — a `minScore` on an rss source
 * would sit there implying a filter that nothing applies.
 */
function configFor(
  kind: SourceKind,
  config: SourceConfig | undefined,
): { config: SourceConfig } | { error: ReturnType<typeof error> } {
  if (kind !== "reddit") return { config: {} };

  const raw = config?.minScore;
  if (raw === undefined || raw === null || raw === ("" as unknown)) {
    return { config: { minScore: DEFAULT_MIN_SCORE } };
  }

  const minScore = Number(raw);
  if (!Number.isInteger(minScore) || minScore < 0) {
    return {
      error: error(400, "minScore must be a whole number of points, 0 or more"),
    };
  }
  return { config: { minScore } };
}

/**
 * Writes the outcome into the conversation that asked for it.
 *
 * Without this the agent never learns what the reader decided: it proposed
 * something, was told to wait, and then sees the world silently change under
 * it — so it re-proposes a merge that already happened and spends turns
 * working out why the story it named has vanished.
 *
 * Filed as a tool row, which is what it is: something the system did, reported
 * back. The transcript renders it folded, and `replay` hands it to the model
 * with the other results.
 */
async function tellTheAgent(
  proposal: proposals.Proposal,
  outcome: string,
): Promise<void> {
  await agentSessions.append(proposal.sessionId, {
    role: "tool",
    content: outcome,
    toolName: "PROPOSAL",
    toolArgs: [String(proposal.id)],
  });
}

/** The outcome in a line, for the agent and for the record. */
function describe(
  proposal: proposals.Proposal,
  result: Record<string, unknown>,
): string {
  if (proposal.kind === "merge_stories") {
    const { title, merged, moved, articles } = result as {
      title?: string;
      merged?: { title?: string };
      moved?: number;
      articles?: number;
    };
    return (
      `"${merged?.title}" no longer exists; its ${moved} articles moved to ` +
      `"${title}", which now holds ${articles}.`
    );
  }
  return "done.";
}

/**
 * An approved proposal, done. Each kind reads its own payload back — written
 * when the reader was shown it, so approving does what was on screen.
 */
async function carryOut(
  proposal: proposals.Proposal,
): Promise<Record<string, unknown>> {
  if (proposal.kind === "merge_stories") {
    const { sourceId, targetId } = proposal.payload as {
      sourceId?: number;
      targetId?: number;
    };
    if (!sourceId || !targetId) {
      throw new Error("this merge proposal is missing one of its stories");
    }
    return {
      ...(await stories.merge(proposal.dashboardId, sourceId, targetId)),
    };
  }

  throw new Error(`nothing knows how to carry out a ${proposal.kind} proposal`);
}

/**
 * Read the set, change it, write the next version — the shape every reader
 * edit takes, since the row is the whole list rather than the line they
 * touched. A mutation that returns null means the fact it named is not in the
 * current set: a 404, rather than a version recording that nothing happened.
 */
async function reviseFacts(
  dashboardId: string,
  mutate: (current: facts.FactWithSource[]) => facts.FactDraft[] | null,
) {
  const id = dashboards.resolveId(dashboardId);
  if (!(await dashboards.exists(id))) return error(404, "dashboard not found");

  const current = await facts.current(id);
  const next = mutate(current?.facts ?? []);
  if (!next) return error(404, "fact not found");

  const version = await facts.revise(id, { facts: next, author: "reader" });
  return ok({ facts: version.facts, version: version.version });
}

/**
 * The arc as the reader has it on screen, for the agent's system message: the
 * name, then every story under it with how much has been filed and how recent
 * it is. Titles only — the articles are a tool call away, and putting them all
 * here would cost more than it is worth on a chat that asks about one of them.
 */
function dashboardContext(
  name: string,
  storyFeed: StoryFeedEntry[],
  known: facts.FactWithSource[],
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
    factsContext(known),
    "",
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

/**
 * The standing knowledge, written into the system message rather than left to
 * a tool call: it is what the agent knows before it looks at anything, and a
 * question about the arc should not have to be paid for with a lookup first.
 */
function factsContext(known: facts.FactWithSource[]): string {
  if (known.length === 0) {
    return `Nothing has been established as fact for this dashboard yet. Write down what you settle.`;
  }

  const lines = known.map((fact) => {
    const label = facts.CONFIDENCE_LABELS[fact.confidence] ?? "";
    const source = fact.articleTitle ? `, from "${fact.articleTitle}"` : "";
    return `- ${fact.id} [${fact.confidence}/5 ${label}] ${fact.content}${source}`;
  });

  return [
    `Established facts for this dashboard, newest first. The number is how far`,
    `each can be trusted: 1 rumour, 2 one source, 3 reported, 4 corroborated,`,
    `5 certain. The ids are what REVISE_FACTS takes: carry across the ones you`,
    `are keeping, with their ids, and leave out only what you mean to drop.`,
    "",
    lines.join("\n"),
  ].join("\n");
}
