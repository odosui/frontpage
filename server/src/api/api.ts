import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import fs from "fs";
import os from "os";
import path from "path";
import { ok, error } from "./helpers";
import { sendMessage } from "../components/ai/Anthropic";

dayjs.extend(relativeTime);

const CONFIG_PATH = path.join(os.homedir(), ".frontpage.json");
const MAX_ITEMS = 20;

type Article = {
  title: string;
  url: string;
  image: string;
  new?: boolean;
};

type LayoutItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  url?: string;
  items?: Article[];
};

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
      return ok(config);
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

      const res = await fetch(widget.url);
      const html = await res.text();

      const existingUrls = new Set((widget.items || []).map((a) => a.url));

      const aiResponse = await sendMessage(
        "claude-haiku-4-5",
        `Extract articles from this webpage HTML. Return ONLY a JSON array of objects with fields: title (string), url (absolute URL), image (absolute URL to article thumbnail/image, empty string if none). Only include actual articles/posts, not navigation or ads. Return newest first.\n\nWebsite base URL: ${widget.url}\n\nHTML:\n${html.slice(0, 80000)}`,
      );

      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return error(500, "failed to parse AI response");
      }

      const freshArticles: Article[] = JSON.parse(jsonMatch[0]);
      const newArticles = freshArticles
        .filter((a) => !existingUrls.has(a.url))
        .map((a) => ({ ...a, new: true }));

      const oldItems = (widget.items || []).map((a) => ({ ...a, new: false }));
      widget.items = [...newArticles, ...oldItems].slice(0, MAX_ITEMS);

      writeConfig(config);
      return ok({ items: widget.items });
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
