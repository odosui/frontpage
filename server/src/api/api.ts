import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { fetchLatestArticles } from "../components/websites/fetcher";
import * as dbs from "./dashboards";
import { error, ok } from "./helpers";
import { Article, LayoutItem } from "./types";

dayjs.extend(relativeTime);

const MAX_ITEMS = 100;

export const createApi = () => {
  dbs.migrate();
  dbs.ensureConfigDir();

  return {
    health: () => ok({ status: "ok" }),

    listDashboards: () => {
      return ok({ dashboards: dbs.listAll() });
    },

    createDashboard: (body: { name: string }) => {
      if (!body.name || typeof body.name !== "string") {
        return error(400, "name is required");
      }
      const id = dbs.create(body.name);
      if (!id) return error(400, "invalid name");
      if (dbs.exists(id)) return error(409, "dashboard already exists");
      dbs.writeDashboard(id, { layout: [] });
      return ok({ id });
    },

    deleteDashboard: (id: string) => {
      if (!id || dbs.isDefault(id)) {
        return error(400, "cannot delete default dashboard");
      }
      if (!dbs.exists(id)) return error(404, "dashboard not found");
      dbs.remove(id);
      return ok({ success: true });
    },

    renameDashboard: (id: string, body: { name: string }) => {
      if (!id) return error(400, "dashboard id is required");
      if (!body.name || typeof body.name !== "string")
        return error(400, "name is required");
      const newId = dbs.create(body.name);
      if (!newId) return error(400, "invalid name");
      if (!dbs.exists(id)) return error(404, "dashboard not found");
      if (dbs.exists(newId)) return error(409, "name already taken");
      dbs.rename(id, newId);
      return ok({ id: newId });
    },

    getLayout: (dashboardId: string) => {
      const id = dbs.resolveId(dashboardId);
      const config = dbs.readDashboard(id);
      const layout = config.layout.map((item) => ({
        ...item,
        items: (item.items || []).slice(0, MAX_ITEMS),
      }));
      return ok({ layout });
    },

    saveLayout: (dashboardId: string, body: { layout: LayoutItem[] }) => {
      const id = dbs.resolveId(dashboardId);
      if (!Array.isArray(body.layout)) {
        return error(400, "layout must be an array");
      }
      dbs.updateLayout(id, body.layout);
      return ok({ success: true });
    },

    refreshWidget: async (dashboardId: string, widgetId: string) => {
      const id = dbs.resolveId(dashboardId);
      if (!widgetId) {
        return error(400, "widget id is required");
      }
      const config = dbs.readDashboard(id);
      const widget = config.layout.find((item) => item.i === widgetId);
      if (!widget) {
        return error(404, "widget not found");
      }
      if (!widget.url) {
        return error(400, "widget has no url configured");
      }

      const existingUrls = new Set((widget.items || []).map((a) => a.url));

      console.log(`[refresh] ${id}/${widgetId} fetching ${widget.url}`);
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
      const newArticles = freshArticles
        .filter((a) => {
          if (existingUrls.has(a.url) || seenUrls.has(a.url)) return false;
          seenUrls.add(a.url);
          return true;
        })
        .map((a) => ({ ...a, new: true }));

      const oldItems = (widget.items || []).map((a) => ({ ...a, new: false }));
      const allItems = [...newArticles, ...oldItems];
      dbs.updateContent(id, widgetId, allItems);

      const elapsed = Date.now() - start;
      console.log(
        `[refresh] ${id}/${widgetId} done in ${elapsed}ms — ${freshArticles.length} fetched, ${newArticles.length} new`,
      );

      return ok({ items: allItems.slice(0, MAX_ITEMS) });
    },

    addWidget: (dashboardId: string, body: { widget: LayoutItem }) => {
      const id = dbs.resolveId(dashboardId);
      if (!body.widget) {
        return error(400, "widget is required");
      }
      const config = dbs.readDashboard(id);
      config.layout.push(body.widget);
      dbs.writeDashboard(id, config);
      return ok({ widget: body.widget });
    },

    deleteWidget: (dashboardId: string, widgetId: string) => {
      const id = dbs.resolveId(dashboardId);
      if (!widgetId) {
        return error(400, "widget id is required");
      }
      const config = dbs.readDashboard(id);
      const before = config.layout.length;
      config.layout = config.layout.filter((item) => item.i !== widgetId);
      if (config.layout.length === before) {
        return error(404, "widget not found");
      }
      dbs.writeDashboard(id, config);
      return ok({ success: true });
    },
  };
};

export type Api = ReturnType<typeof createApi>;
