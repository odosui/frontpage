import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  FRONTPAGE_MODEL,
  fetchLatestArticles,
} from "../components/websites/fetcher";
import * as dbs from "./dashboards";
import { error, ok } from "./helpers";
import { Article, LayoutItem } from "./types";

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

      const existingUrls = await dbs.articleUrls(id, widgetId);

      console.log(`[refresh] ${id}/${widgetId} fetching ${widget.url} (model: ${FRONTPAGE_MODEL})`);
      const start = Date.now();

      let freshArticles: Article[] = [];

      try {
        freshArticles = await fetchLatestArticles(widget.url);
      } catch (err) {
        const elapsed = Date.now() - start;
        console.log(
          `[refresh] ${id}/${widgetId} failed after ${elapsed}ms: ${err instanceof Error ? err.message : String(err)}`,
        );
        return error(
          500,
          "failed to fetch articles: " +
            (err instanceof Error ? err.message : String(err)),
        );
      }

      const seenUrls = new Set<string>();
      const newArticles = freshArticles.filter((a) => {
        if (existingUrls.has(a.url) || seenUrls.has(a.url)) return false;
        seenUrls.add(a.url);
        return true;
      });

      const items = await dbs.prependArticles(
        id,
        widgetId,
        newArticles,
        MAX_ITEMS,
      );

      const elapsed = Date.now() - start;
      console.log(
        `[refresh] ${id}/${widgetId} done in ${elapsed}ms — ${freshArticles.length} fetched, ${newArticles.length} new`,
      );

      return ok({ items });
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
  };
};

export type Api = Awaited<ReturnType<typeof createApi>>;
