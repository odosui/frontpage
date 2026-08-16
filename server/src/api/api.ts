import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import * as queue from "../jobs/queue";
import { JOB_STATUSES, JobStatus } from "../jobs/types";
import { AGENT_KINDS, getAgent } from "../components/agents/registry";
import { startChat } from "../components/agents/chat";
import { BIG_MODEL } from "../components/ai/models";
import { DEFAULT_WINDOW_DAYS } from "../components/stories/categorize";
import * as agentSessions from "../models/agentSessions";
import * as articles from "../models/articles";
import * as channels from "../models/channels";
import * as dashboards from "../models/dashboards";
import * as facts from "../models/facts";
import * as proposals from "../models/proposals";
import * as stories from "../models/stories";
import { error, ok } from "./helpers";
import * as stats from "./stats";
import { CHANNEL_KINDS, Channel, ChannelKind, StoryFeedEntry } from "./types";

dayjs.extend(relativeTime);

const MAX_ITEMS = 100;
const MAX_STORIES = 50;

export const createApi = async () => {
  await dashboards.ensureDefaultDashboard();

  return {
    health: () => ok({ status: "ok" }),

    listDashboards: async () => {
      return ok({ dashboards: await dashboards.listAll() });
    },

    createDashboard: async (body: { name: string }) => {
      if (!body.name || typeof body.name !== "string") {
        return error(400, "name is required");
      }
      const id = dashboards.slugify(body.name);
      if (!id) return error(400, "invalid name");
      if (await dashboards.exists(id))
        return error(409, "dashboard already exists");
      await dashboards.create(id, body.name);
      return ok({ id });
    },

    deleteDashboard: async (id: string) => {
      if (!id || dashboards.isDefault(id)) {
        return error(400, "cannot delete default dashboard");
      }
      if (!(await dashboards.exists(id)))
        return error(404, "dashboard not found");
      await dashboards.remove(id);
      return ok({ success: true });
    },

    renameDashboard: async (id: string, body: { name: string }) => {
      if (!id) return error(400, "dashboard id is required");
      if (!body.name || typeof body.name !== "string")
        return error(400, "name is required");
      const newId = dashboards.slugify(body.name);
      if (!newId) return error(400, "invalid name");
      if (!(await dashboards.exists(id)))
        return error(404, "dashboard not found");
      if (await dashboards.exists(newId))
        return error(409, "name already taken");
      await dashboards.rename(id, newId);
      return ok({ id: newId });
    },

    /** Channels plus the merged article feed — everything the page renders. */
    getDashboard: async (dashboardId: string) => {
      const id = dashboards.resolveId(dashboardId);
      const [list, feed, storyFeed, uncategorized] = await Promise.all([
        channels.list(id),
        articles.feed(id, MAX_ITEMS),
        stories.feed(id, MAX_STORIES),
        articles.uncategorizedCount(id, DEFAULT_WINDOW_DAYS),
      ]);
      return ok({ channels: list, feed, stories: storyFeed, uncategorized });
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

    /** One arc and everything filed under it — what the storyline page reads. */
    getStoryline: async (dashboardId: string, slug: string) => {
      const id = dashboards.resolveId(dashboardId);
      if (!slug) return error(400, "storyline slug is required");

      const found = await stories.feedForStoryline(id, slug, MAX_STORIES);
      if (!found) return error(404, "storyline not found");
      return ok({
        ...found,
        facts: await facts.forStoryline(id, found.storyline.id),
      });
    },

    createFact: async (
      dashboardId: string,
      slug: string,
      body: { content?: string; confidence?: number; articleId?: number | null },
    ) => {
      const id = dashboards.resolveId(dashboardId);
      const content = (body?.content ?? "").trim();
      if (!content) return error(400, "content is required");

      const found = await stories.feedForStoryline(id, slug, 1);
      if (!found) return error(404, "storyline not found");

      return ok({
        fact: await facts.create({
          dashboardId: id,
          storylineId: found.storyline.id,
          content,
          ...(body.confidence !== undefined
            ? { confidence: Number(body.confidence) }
            : {}),
          ...(body.articleId !== undefined ? { articleId: body.articleId } : {}),
        }),
      });
    },

    updateFact: async (
      dashboardId: string,
      factId: string,
      body: { content?: string; confidence?: number; articleId?: number | null },
    ) => {
      const id = dashboards.resolveId(dashboardId);
      const numeric = Number(factId);
      if (!Number.isFinite(numeric)) return error(400, "fact id must be a number");

      const content = body?.content?.trim();
      if (content !== undefined && !content) {
        return error(400, "content cannot be emptied");
      }

      const updated = await facts.update(id, numeric, {
        ...(content !== undefined ? { content } : {}),
        ...(body?.confidence !== undefined
          ? { confidence: Number(body.confidence) }
          : {}),
        ...(body?.articleId !== undefined ? { articleId: body.articleId } : {}),
      });
      if (!updated) return error(404, "fact not found");
      return ok({ fact: updated });
    },

    deleteFact: async (dashboardId: string, factId: string) => {
      const id = dashboards.resolveId(dashboardId);
      const numeric = Number(factId);
      if (!Number.isFinite(numeric)) return error(400, "fact id must be a number");

      const removed = await facts.remove(id, numeric);
      if (!removed) return error(404, "fact not found");
      return ok({ success: true });
    },

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

      const article = await articles.byId(id, numeric);
      if (!article) {
        return error(404, "article not found");
      }

      // deliberately no channelId: the dashboard reads that as "this channel
      // is refreshing" and would spin the whole channel for one article
      const job = await queue.enqueue({
        type: "extract_content",
        payload: { dashboardId: id, articleId: numeric, url: article.url },
      });
      console.log(`[content] ${id}/${numeric} queued as job ${job.id}`);

      return ok({ job });
    },

    /** The stored text, or a 404 if nothing has read this article yet. */
    getArticleContent: async (dashboardId: string, articleId: string) => {
      const id = dashboards.resolveId(dashboardId);
      const numeric = Number(articleId);
      if (!Number.isInteger(numeric) || numeric <= 0) {
        return error(400, "a numeric article id is required");
      }

      const article = await articles.byId(id, numeric);
      if (!article) {
        return error(404, "article not found");
      }

      const stored = await articles.contentOf(id, numeric);
      if (!stored) {
        return error(404, "this article has not been read yet");
      }

      return ok({
        title: article.title,
        url: article.url,
        channelId: article.channelId,
        ...stored,
      });
    },

    listChannels: async (dashboardId: string) => {
      const id = dashboards.resolveId(dashboardId);
      return ok({ channels: await channels.list(id) });
    },

    /**
     * Queues the work rather than doing it — the worker picks up fetch_page,
     * which chains into extract_articles. Clients follow progress via /api/jobs.
     */
    refreshChannel: async (dashboardId: string, channelId: string) => {
      const id = dashboards.resolveId(dashboardId);
      if (!channelId) {
        return error(400, "channel id is required");
      }
      const channel = await channels.get(id, channelId);
      if (!channel) {
        return error(404, "channel not found");
      }
      if (!channel.url) {
        return error(400, "channel has no url configured");
      }
      // a feed says what its articles are, so rss skips the page-analysis
      // chain entirely and goes straight to a single parse-and-store job
      const type =
        channel.kind === "web"
          ? "fetch_page"
          : channel.kind === "rss"
            ? "fetch_feed"
            : null;
      if (!type) {
        return error(400, `${channel.kind} channels cannot be fetched yet`);
      }

      const job = await queue.enqueue({
        type,
        payload: { dashboardId: id, channelId, url: channel.url },
      });
      console.log(`[refresh] ${id}/${channelId} queued as job ${job.id}`);

      return ok({ job });
    },

    addChannel: async (dashboardId: string, body: { channel: Channel }) => {
      const id = dashboards.resolveId(dashboardId);
      const channel = body.channel;
      if (!channel || !channel.id || typeof channel.id !== "string") {
        return error(400, "channel id is required");
      }
      if (!channel.url || typeof channel.url !== "string") {
        return error(400, "channel url is required");
      }
      const kind = (channel.kind || "web") as ChannelKind;
      if (!CHANNEL_KINDS.includes(kind)) {
        return error(400, `kind must be one of ${CHANNEL_KINDS.join(", ")}`);
      }
      const saved: Channel = { id: channel.id, kind, url: channel.url };
      await channels.add(id, saved);
      return ok({ channel: saved });
    },

    deleteChannel: async (dashboardId: string, channelId: string) => {
      const id = dashboards.resolveId(dashboardId);
      if (!channelId) {
        return error(400, "channel id is required");
      }
      if (!(await channels.remove(id, channelId))) {
        return error(404, "channel not found");
      }
      return ok({ success: true });
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
      return ok({
        sessions: await agentSessions.list(id, params.kind, limit),
      });
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
      const job = await queue.enqueue({
        type: "run_agent",
        payload: {
          kind,
          dashboardId: id,
        },
      });
      return ok({ job });
    },

    /**
     * Opens a conversation with an agent. Only the system message is written
     * here — nothing is asked until the first message arrives, so opening a
     * chat and never using it costs no model call.
     */
    startChat: async (
      dashboardId: string,
      body: { kind?: string; storyline?: string },
    ) => {
      const id = dashboards.resolveId(dashboardId);
      const kind = body?.kind || "";
      if (!AGENT_KINDS.includes(kind)) {
        return error(400, `kind must be one of ${AGENT_KINDS.join(", ")}`);
      }
      if (!(await dashboards.exists(id))) {
        return error(404, "dashboard not found");
      }

      // The arc the chat was opened from, written into the system message: the
      // first question is nearly always about something already on the screen,
      // and a turn spent looking up what is in front of the reader is a turn
      // they wait through for nothing.
      const found = body?.storyline
        ? await stories.feedForStoryline(id, body.storyline, MAX_STORIES)
        : null;
      const context = found
        ? storylineContext(
            found,
            await facts.forStoryline(id, found.storyline.id),
          )
        : undefined;

      const { sessionId } = await startChat(getAgent(kind), {
        model: BIG_MODEL,
        dashboardId: id,
        ...(context ? { context } : {}),
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
 * The arc as the reader has it on screen, for the agent's system message: the
 * title, then every story under it with how much has been filed and how recent
 * it is. Titles only — the articles are a tool call away, and putting them all
 * here would cost more than it is worth on a chat that asks about one of them.
 */
function storylineContext(
  found: { storyline: { title: string }; stories: StoryFeedEntry[] },
  known: facts.Fact[],
): string {
  const lines = found.stories.map((story) => {
    const when = dayjs(story.updatedAt).fromNow();
    return `- ${story.title} (${story.articles.length} articles, newest ${when})`;
  });

  return [
    `The reader has the storyline "${found.storyline.title}" open, and the`,
    `questions are most likely about it. The stories filed under it, newest`,
    `first:`,
    "",
    lines.length > 0 ? lines.join("\n") : "(nothing filed under it yet)",
    "",
    `Those titles are exact — pass one to GET_STORY to read the articles under`,
    `it. The arc may also have older stories not listed here.`,
    "",
    factsContext(known),
  ].join("\n");
}

/**
 * The standing knowledge, written into the system message rather than left to
 * a tool call: it is what the agent knows before it looks at anything, and a
 * question about the arc should not have to be paid for with a lookup first.
 */
function factsContext(known: facts.Fact[]): string {
  if (known.length === 0) {
    return `Nothing has been established as fact for this storyline yet. Add what you settle.`;
  }

  const lines = known.map((fact) => {
    const label = facts.CONFIDENCE_LABELS[fact.confidence] ?? "";
    const source = fact.articleTitle ? `, from "${fact.articleTitle}"` : "";
    return `- #${fact.id} [${fact.confidence}/5 ${label}] ${fact.content}${source}`;
  });

  return [
    `Established facts for this storyline, surest first. The number is how far`,
    `each can be trusted: 1 rumour, 2 one source, 3 reported, 4 corroborated,`,
    `5 certain. The ids are what UPDATE_FACT and DELETE_FACT take.`,
    "",
    lines.join("\n"),
  ].join("\n");
}
