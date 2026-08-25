import * as queue from "../../jobs/queue";
import { Job } from "../../jobs/types";
import * as sources from "../../models/sources";
import { Source, SourceKind } from "../../api/types";

/** Which job reads each kind of source; a kind with none cannot be fetched. */
export const FETCHERS: Partial<Record<SourceKind, string>> = {
  web: "fetch_page",
  rss: "fetch_feed",
  reddit: "fetch_reddit",
};

/**
 * Queues one source's fetch. The work itself is the worker's: `fetch_page`
 * chains into extract_articles, while a feed or a subreddit already says what
 * its articles are and goes straight to parse-and-store.
 *
 * A source is fetched once however many dashboards read it.
 */
export async function queueFetch(
  source: Source,
): Promise<{ job: Job } | { error: string }> {
  if (!source.url) return { error: "source has no url configured" };

  const type = FETCHERS[source.kind] ?? null;
  if (!type) return { error: `${source.kind} sources cannot be fetched yet` };

  const job = await queue.enqueue({
    type,
    payload: { sourceId: source.id, url: source.url },
  });
  return { job };
}

export type RefreshAll = {
  queued: number;
  /** Sources that could not be queued, with why — a bad url, an unfetchable kind. */
  skipped: { id: string; reason: string }[];
};

/**
 * Every source there is, in one pass. This is what the scheduled refresh runs:
 * one queued job per source, and the worker drains them at its own pace.
 */
export async function refreshAll(): Promise<RefreshAll> {
  const all = await sources.all();
  const skipped: RefreshAll["skipped"] = [];
  let queued = 0;

  for (const source of all) {
    const result = await queueFetch(source);
    if ("error" in result) skipped.push({ id: source.id, reason: result.error });
    else queued++;
  }

  return { queued, skipped };
}
