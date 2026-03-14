import fs from "fs";
import os from "os";
import path from "path";
import { Article, LayoutItem } from "./types";

const CONFIG_DIR =
  process.env.FRONTPAGE_HOME || path.join(os.homedir(), ".frontpage");
const DEFAULT_DASHBOARD = "default";

export function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function dashboardPath(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(CONFIG_DIR, `${safe}.json`);
}

export function resolveId(id: string): string {
  return id || DEFAULT_DASHBOARD;
}

export function readDashboard(id: string): { layout: LayoutItem[] } {
  try {
    const data = fs.readFileSync(dashboardPath(id), "utf-8");
    return JSON.parse(data);
  } catch {
    return { layout: [] };
  }
}

export function writeDashboard(id: string, config: { layout: LayoutItem[] }) {
  ensureConfigDir();
  fs.writeFileSync(dashboardPath(id), JSON.stringify(config, null, 2), "utf-8");
}

/** Update only positions/sizes, preserve items from disk */
export function updateLayout(id: string, layout: Omit<LayoutItem, "items">[]) {
  const config = readDashboard(id);
  config.layout = layout.map((incoming) => {
    const existing = config.layout.find((e) => e.i === incoming.i);
    return { ...incoming, items: existing?.items || [] };
  });
  writeDashboard(id, config);
}

/** Update only items for a single widget, preserve layout from disk */
export function updateContent(id: string, widgetId: string, items: Article[]) {
  const config = readDashboard(id);
  const widget = config.layout.find((item) => item.i === widgetId);
  if (widget) {
    widget.items = items;
    writeDashboard(id, config);
  }
}

export function listAll(): string[] {
  const files = fs.readdirSync(CONFIG_DIR).filter((f) => f.endsWith(".json"));
  const dashboards = files.map((f) => f.replace(/\.json$/, ""));
  if (!dashboards.includes(DEFAULT_DASHBOARD)) {
    writeDashboard(DEFAULT_DASHBOARD, { layout: [] });
    dashboards.unshift(DEFAULT_DASHBOARD);
  }
  return dashboards;
}

export function create(name: string): string {
  const id = name.replace(/[^a-zA-Z0-9_-]/g, "");
  return id;
}

export function exists(id: string): boolean {
  return fs.existsSync(dashboardPath(id));
}

export function remove(id: string) {
  fs.unlinkSync(dashboardPath(id));
}

export function rename(oldId: string, newId: string) {
  fs.renameSync(dashboardPath(oldId), dashboardPath(newId));
}

export function isDefault(id: string): boolean {
  return id === DEFAULT_DASHBOARD;
}

export function migrate() {
  const oldPath = path.join(os.homedir(), ".frontpage.json");
  if (fs.existsSync(oldPath) && !exists(DEFAULT_DASHBOARD)) {
    ensureConfigDir();
    fs.renameSync(oldPath, dashboardPath(DEFAULT_DASHBOARD));
  }
}
