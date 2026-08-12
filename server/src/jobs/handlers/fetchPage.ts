import { createHash } from "crypto";
import * as dbs from "../../api/dashboards";
import { fetchPage } from "../../components/websites/fetcher";
import { saveSnapshot } from "../snapshots";
import { JobHandler } from "../types";

export type FetchPagePayload = {
  dashboardId: string;
  widgetId: string;
};

/**
 * Download a widget's page and hand it to an analyze_page job. Kept separate
 * from the analysis so a slow model can't force a re-download.
 *
 * Skips the (expensive) analysis entirely when the page hasn't changed since
 * the last successful run — either because the server said 304, or because
 * the cleaned html hashes to the same value.
 */
export const fetchPageHandler: JobHandler = async (payload, { log }) => {
  const { dashboardId, widgetId } = payload as FetchPagePayload;
  if (!dashboardId || !widgetId) {
    throw new Error("fetch_page requires dashboardId and widgetId");
  }

  const widget = await dbs.getWidget(dashboardId, widgetId);
  if (!widget) {
    throw new Error(`widget ${dashboardId}/${widgetId} no longer exists`);
  }
  if (!widget.url) {
    throw new Error(`widget ${dashboardId}/${widgetId} has no url configured`);
  }

  const state = await dbs.getFetchState(dashboardId, widgetId);
  // only trust the validators if a previous analysis actually completed,
  // otherwise a 304 would strand the widget with no articles
  const validators = state?.contentHash
    ? { etag: state.etag, lastModified: state.lastModified }
    : undefined;

  const page = await fetchPage(widget.url, validators);

  if (page.notModified) {
    log(`${widget.url} unchanged (304), skipping analysis`);
    return { result: { url: widget.url, unchanged: "not-modified" } };
  }

  await dbs.saveValidators(dashboardId, widgetId, {
    etag: page.etag ?? null,
    lastModified: page.lastModified ?? null,
  });

  const contentHash = createHash("sha256").update(page.html).digest("hex");

  if (state?.contentHash === contentHash) {
    log(`${widget.url} unchanged (same content), skipping analysis`);
    return { result: { url: widget.url, unchanged: "same-content" } };
  }

  const snapshotId = await saveSnapshot(widget.url, page);

  log(
    `fetched ${widget.url} — ${page.html.length} chars, ${page.hrefs.length} links`,
  );

  return {
    result: {
      url: widget.url,
      snapshotId,
      htmlChars: page.html.length,
      links: page.hrefs.length,
    },
    enqueue: [
      {
        type: "analyze_page",
        payload: {
          dashboardId,
          widgetId,
          snapshotId,
          contentHash,
          url: widget.url,
        },
      },
    ],
  };
};
