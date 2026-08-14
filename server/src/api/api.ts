import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import * as queue from "../jobs/queue";
import { JOB_STATUSES, JobStatus } from "../jobs/types";
import * as dbs from "./dashboards";
import { error, ok } from "./helpers";
import * as stats from "./stats";
import { CHANNEL_KINDS, Channel, ChannelKind } from "./types";

dayjs.extend(relativeTime);

const MAX_ITEMS = 100;

export const createApi = async () => {
  await dbs.ensureDefaultDashboard();

  return {
    health: () => ok({ status: "ok" }),

    listDashboards: async () => {
      return ok({ dashboards: await dbs.listAll() });
    },

    createDashboard: async (body: { name: string }) => {
      if (!body.name || typeof body.name !== "string") {
        return error(400, "name is required");
      }
      const id = dbs.slugify(body.name);
      if (!id) return error(400, "invalid name");
      if (await dbs.exists(id)) return error(409, "dashboard already exists");
      await dbs.create(id, body.name);
      return ok({ id });
    },

    deleteDashboard: async (id: string) => {
      if (!id || dbs.isDefault(id)) {
        return error(400, "cannot delete default dashboard");
      }
      if (!(await dbs.exists(id))) return error(404, "dashboard not found");
      await dbs.remove(id);
      return ok({ success: true });
    },

    renameDashboard: async (id: string, body: { name: string }) => {
      if (!id) return error(400, "dashboard id is required");
      if (!body.name || typeof body.name !== "string")
        return error(400, "name is required");
      const newId = dbs.slugify(body.name);
      if (!newId) return error(400, "invalid name");
      if (!(await dbs.exists(id))) return error(404, "dashboard not found");
      if (await dbs.exists(newId)) return error(409, "name already taken");
      await dbs.rename(id, newId);
      return ok({ id: newId });
    },

    /** Channels plus the merged article feed — everything the page renders. */
    getDashboard: async (dashboardId: string) => {
      const id = dbs.resolveId(dashboardId);
      const [channels, feed] = await Promise.all([
        dbs.listChannels(id),
        dbs.getFeed(id, MAX_ITEMS),
      ]);
      return ok({ channels, feed });
    },

    getFeed: async (dashboardId: string) => {
      const id = dbs.resolveId(dashboardId);
      return ok({ feed: await dbs.getFeed(id, MAX_ITEMS) });
    },

    listChannels: async (dashboardId: string) => {
      const id = dbs.resolveId(dashboardId);
      return ok({ channels: await dbs.listChannels(id) });
    },

    /**
     * Queues the work rather than doing it — the worker picks up fetch_page,
     * which chains into analyze_page. Clients follow progress via /api/jobs.
     */
    refreshChannel: async (dashboardId: string, channelId: string) => {
      const id = dbs.resolveId(dashboardId);
      if (!channelId) {
        return error(400, "channel id is required");
      }
      const channel = await dbs.getChannel(id, channelId);
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
      const id = dbs.resolveId(dashboardId);
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
      await dbs.addChannel(id, saved);
      return ok({ channel: saved });
    },

    deleteChannel: async (dashboardId: string, channelId: string) => {
      const id = dbs.resolveId(dashboardId);
      if (!channelId) {
        return error(400, "channel id is required");
      }
      if (!(await dbs.deleteChannel(id, channelId))) {
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
