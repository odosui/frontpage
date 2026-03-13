import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import fs from "fs";
import os from "os";
import path from "path";
import { ok, error } from "./helpers";

dayjs.extend(relativeTime);

const CONFIG_PATH = path.join(os.homedir(), ".frontpage.json");

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

type LayoutItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
};

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
  };
};

export type Api = ReturnType<typeof createApi>;
