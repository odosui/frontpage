import * as dbs from "../../api/dashboards";
import {
  FRONTPAGE_MODEL,
  analyzePage,
} from "../../components/websites/fetcher";
import { deleteSnapshot, loadSnapshot } from "../snapshots";
import { JobHandler } from "../types";

export type AnalyzePagePayload = {
  dashboardId: string;
  widgetId: string;
  snapshotId: string;
  /** Hash of the analyzed html, recorded so the next fetch can skip a no-op. */
  contentHash?: string;
};

/** How many articles a widget keeps. Mirrors the API's page size. */
const MAX_ITEMS = 100;

/** Run the model over a fetched page and store whatever articles are new. */
export const analyzePageHandler: JobHandler = async (payload, { log }) => {
  const { dashboardId, widgetId, snapshotId, contentHash } =
    payload as AnalyzePagePayload;
  if (!dashboardId || !widgetId || !snapshotId) {
    throw new Error(
      "analyze_page requires dashboardId, widgetId and snapshotId",
    );
  }

  const snapshot = await loadSnapshot(snapshotId);
  if (!snapshot) {
    throw new Error(`page snapshot ${snapshotId} is gone — re-fetch the page`);
  }

  log(`analyzing ${snapshot.url} with ${FRONTPAGE_MODEL}`);
  const articles = await analyzePage(snapshot.url, snapshot);

  // drop duplicates within the response; the insert filters against what is
  // already stored
  const seen = new Set<string>();
  const unique = articles.filter((a) => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  const items = await dbs.prependArticles(
    dashboardId,
    widgetId,
    unique,
    MAX_ITEMS,
  );
  const added = items.filter((a) => a.new).length;

  // only now is it safe to remember this page as "already analyzed"
  if (contentHash) {
    await dbs.saveContentHash(dashboardId, widgetId, contentHash);
  }

  await deleteSnapshot(snapshotId);

  log(`extracted ${articles.length}, ${added} new`);

  return {
    result: {
      url: snapshot.url,
      model: FRONTPAGE_MODEL,
      extracted: articles.length,
      added,
    },
  };
};
