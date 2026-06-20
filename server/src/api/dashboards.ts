import fs from "fs/promises";
import os from "os";
import path from "path";
import { Article, LayoutItem } from "./types";

const CONFIG_DIR =
  process.env.FRONTPAGE_HOME || path.join(os.homedir(), ".frontpage");
const DEFAULT_DASHBOARD = "default";

// Serialize read-modify-write operations per dashboard id so concurrent
// refreshes/saves can't clobber each other's writes (last-write-wins).
const locks = new Map<string, Promise<unknown>>();

function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  // run fn after the previous op regardless of whether it resolved or rejected
  const next = prev.then(fn, fn);
  // keep the chain alive without surfacing prior rejections to later ops
  locks.set(
    id,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

export async function ensureConfigDir() {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

function dashboardPath(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(CONFIG_DIR, `${safe}.json`);
}

export function resolveId(id: string): string {
  return id || DEFAULT_DASHBOARD;
}

export async function readDashboard(
  id: string,
): Promise<{ layout: LayoutItem[] }> {
  try {
    const data = await fs.readFile(dashboardPath(id), "utf-8");
    return JSON.parse(data);
  } catch {
    return { layout: [] };
  }
}

export async function writeDashboard(
  id: string,
  config: { layout: LayoutItem[] },
) {
  await ensureConfigDir();
  await fs.writeFile(dashboardPath(id), JSON.stringify(config, null, 2), "utf-8");
}

/** Race-safe read-modify-write against a single dashboard's config. */
export function mutate<T>(
  id: string,
  fn: (config: { layout: LayoutItem[] }) => T,
): Promise<T> {
  return withLock(id, async () => {
    const config = await readDashboard(id);
    const result = fn(config);
    await writeDashboard(id, config);
    return result;
  });
}

/** Update only positions/sizes, preserve items from disk */
export function updateLayout(id: string, layout: Omit<LayoutItem, "items">[]) {
  return mutate(id, (config) => {
    config.layout = layout.map((incoming) => {
      const existing = config.layout.find((e) => e.i === incoming.i);
      return { ...incoming, items: existing?.items || [] };
    });
  });
}

/** Update only items for a single widget, preserve layout from disk */
export function updateContent(id: string, widgetId: string, items: Article[]) {
  return mutate(id, (config) => {
    const widget = config.layout.find((item) => item.i === widgetId);
    if (widget) {
      widget.items = items;
    }
  });
}

export async function listAll(): Promise<string[]> {
  await ensureConfigDir();
  const files = (await fs.readdir(CONFIG_DIR)).filter((f) =>
    f.endsWith(".json"),
  );
  const dashboards = files.map((f) => f.replace(/\.json$/, ""));
  if (!dashboards.includes(DEFAULT_DASHBOARD)) {
    await writeDashboard(DEFAULT_DASHBOARD, { layout: [] });
    dashboards.unshift(DEFAULT_DASHBOARD);
  }
  return dashboards;
}

export function create(name: string): string {
  const id = name.replace(/[^a-zA-Z0-9_-]/g, "");
  return id;
}

export async function exists(id: string): Promise<boolean> {
  try {
    await fs.access(dashboardPath(id));
    return true;
  } catch {
    return false;
  }
}

export async function remove(id: string) {
  await fs.unlink(dashboardPath(id));
}

export async function rename(oldId: string, newId: string) {
  await fs.rename(dashboardPath(oldId), dashboardPath(newId));
}

export function isDefault(id: string): boolean {
  return id === DEFAULT_DASHBOARD;
}

export async function migrate() {
  const oldPath = path.join(os.homedir(), ".frontpage.json");
  try {
    await fs.access(oldPath);
  } catch {
    return; // nothing to migrate
  }
  if (!(await exists(DEFAULT_DASHBOARD))) {
    await ensureConfigDir();
    await fs.rename(oldPath, dashboardPath(DEFAULT_DASHBOARD));
  }
}
