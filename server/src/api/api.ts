import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import fs from "fs";
import os from "os";
import path from "path";
import { fetchLatestArticles } from "../components/websites/fetcher";
import { error, ok } from "./helpers";
import { Article, LayoutItem } from "./types";

dayjs.extend(relativeTime);

const CONFIG_PATH = path.join(os.homedir(), ".frontpage.json");
const MAX_ITEMS = 100;

function readConfig(): { layout: LayoutItem[] } {
  try {
    const data = fs.readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return { layout: [] };
  }
}

function writeConfig(config: { layout: LayoutItem[] }) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

export const createApi = () => {
  return {
    health: () => ok({ status: "ok" }),

    getLayout: () => {
      const config = readConfig();
      const layout = config.layout.map((item) => ({
        ...item,
        items: (item.items || []).slice(0, MAX_ITEMS),
      }));
      return ok({ layout });
    },

    saveLayout: (body: { layout: LayoutItem[] }) => {
      if (!Array.isArray(body.layout)) {
        return error(400, "layout must be an array");
      }
      const config = readConfig();
      config.layout = body.layout;
      writeConfig(config);
      return ok({ success: true });
    },

    refreshWidget: async (id: string) => {
      if (!id) {
        return error(400, "widget id is required");
      }
      const config = readConfig();
      const widget = config.layout.find((item) => item.i === id);
      if (!widget) {
        return error(404, "widget not found");
      }
      if (!widget.url) {
        return error(400, "widget has no url configured");
      }

      const existingUrls = new Set((widget.items || []).map((a) => a.url));

      let freshArticles: Article[] = [];

      try {
        freshArticles = await fetchLatestArticles(widget.url);
      } catch (err) {
        return error(
          500,
          "failed to fetch articles: " +
            (err instanceof Error ? err.message : String(err)),
        );
      }

      const newArticles = freshArticles
        .filter((a) => !existingUrls.has(a.url))
        .map((a) => ({ ...a, new: true }));

      const oldItems = (widget.items || []).map((a) => ({ ...a, new: false }));
      widget.items = [...newArticles, ...oldItems];
      writeConfig(config);
      return ok({ items: widget.items.slice(0, MAX_ITEMS) });
    },

    deleteWidget: (id: string) => {
      if (!id) {
        return error(400, "widget id is required");
      }
      const config = readConfig();
      const before = config.layout.length;
      config.layout = config.layout.filter((item) => item.i !== id);
      if (config.layout.length === before) {
        return error(404, "widget not found");
      }
      writeConfig(config);
      return ok({ success: true });
    },
  };
};

export type Api = ReturnType<typeof createApi>;
