import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import * as queue from "../jobs/queue";
import { JOB_STATUSES, JobStatus } from "../jobs/types";
import * as articles from "../models/articles";
import * as channels from "../models/channels";
import * as dashboards from "../models/dashboards";
import { error, ok } from "./helpers";
import * as stats from "./stats";
import { CHANNEL_KINDS, Channel, ChannelKind } from "./types";

dayjs.extend(relativeTime);

const MAX_ITEMS = 100;

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
      if (await dashboards.exists(id)) return error(409, "dashboard already exists");
      await dashboards.create(id, body.name);
      return ok({ id });
    },

    deleteDashboard: async (id: string) => {
      if (!id || dashboards.isDefault(id)) {
        return error(400, "cannot delete default dashboard");
      }
      if (!(await dashboards.exists(id))) return error(404, "dashboard not found");
      await dashboards.remove(id);
      return ok({ success: true });
    },

    renameDashboard: async (id: string, body: { name: string }) => {
      if (!id) return error(400, "dashboard id is required");
      if (!body.name || typeof body.name !== "string")
        return error(400, "name is required");
      const newId = dashboards.slugify(body.name);
      if (!newId) return error(400, "invalid name");
      if (!(await dashboards.exists(id))) return error(404, "dashboard not found");
      if (await dashboards.exists(newId)) return error(409, "name already taken");
      await dashboards.rename(id, newId);
      return ok({ id: newId });
    },

    /** Channels plus the merged article feed — everything the page renders. */
    getDashboard: async (dashboardId: string) => {
      const id = dashboards.resolveId(dashboardId);
      const [list, feed] = await Promise.all([
        channels.list(id),
        articles.feed(id, MAX_ITEMS),
      ]);
      return ok({ channels: list, feed });
    },

    getFeed: async (dashboardId: string) => {
      const id = dashboards.resolveId(dashboardId);
      return ok({ feed: await articles.feed(id, MAX_ITEMS) });
    },

    listChannels: async (dashboardId: string) => {
      const id = dashboards.resolveId(dashboardId);
      return ok({ channels: await channels.list(id) });
    },

    /**
     * Queues the work rather than doing it — the worker picks up fetch_page,
     * which chains into analyze_page. Clients follow progress via /api/jobs.
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
      if (channel.kind !== "web") {
        return error(400, `${channel.kind} channels cannot be fetched yet`);
      }

      const job = await queue.enqueue({
        type: "fetch_page",
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

    // Settings

    databaseStats: async () => ok({ stats: await stats.collect() }),
  };
};

export type Api = Awaited<ReturnType<typeof createApi>>;
