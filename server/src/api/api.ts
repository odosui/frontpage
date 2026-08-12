import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import * as queue from "../jobs/queue";
import { JOB_STATUSES, JobStatus } from "../jobs/types";
import * as dbs from "./dashboards";
import { error, ok } from "./helpers";
import * as stats from "./stats";
import { LayoutItem } from "./types";

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

    getLayout: async (dashboardId: string) => {
      const id = dbs.resolveId(dashboardId);
      return ok({ layout: await dbs.getLayout(id, MAX_ITEMS) });
    },

    saveLayout: async (dashboardId: string, body: { layout: LayoutItem[] }) => {
      const id = dbs.resolveId(dashboardId);
      if (!Array.isArray(body.layout)) {
        return error(400, "layout must be an array");
      }
      await dbs.saveLayout(id, body.layout);
      return ok({ success: true });
    },

    /**
     * Queues the work rather than doing it — the worker picks up fetch_page,
     * which chains into analyze_page. Clients follow progress via /api/jobs.
     */
    refreshWidget: async (dashboardId: string, widgetId: string) => {
      const id = dbs.resolveId(dashboardId);
      if (!widgetId) {
        return error(400, "widget id is required");
      }
      const widget = await dbs.getWidget(id, widgetId);
      if (!widget) {
        return error(404, "widget not found");
      }
      if (!widget.url) {
        return error(400, "widget has no url configured");
      }

      const job = await queue.enqueue({
        type: "fetch_page",
        payload: { dashboardId: id, widgetId, url: widget.url },
      });
      console.log(`[refresh] ${id}/${widgetId} queued as job ${job.id}`);

      return ok({ job });
    },

    getWidgetItems: async (dashboardId: string, widgetId: string) => {
      const id = dbs.resolveId(dashboardId);
      if (!widgetId) {
        return error(400, "widget id is required");
      }
      return ok({ items: await dbs.getArticles(id, widgetId, MAX_ITEMS) });
    },

    addWidget: async (dashboardId: string, body: { widget: LayoutItem }) => {
      const id = dbs.resolveId(dashboardId);
      if (!body.widget) {
        return error(400, "widget is required");
      }
      await dbs.addWidget(id, body.widget);
      return ok({ widget: body.widget });
    },

    deleteWidget: async (dashboardId: string, widgetId: string) => {
      const id = dbs.resolveId(dashboardId);
      if (!widgetId) {
        return error(400, "widget id is required");
      }
      if (!(await dbs.deleteWidget(id, widgetId))) {
        return error(404, "widget not found");
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
