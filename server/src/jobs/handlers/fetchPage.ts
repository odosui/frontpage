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

  const snapshot = await fetchPage(widget.url);
  const snapshotId = await saveSnapshot(widget.url, snapshot);

  log(
    `fetched ${widget.url} — ${snapshot.html.length} chars, ${snapshot.hrefs.length} links`,
  );

  return {
    result: {
      url: widget.url,
      snapshotId,
      htmlChars: snapshot.html.length,
      links: snapshot.hrefs.length,
    },
    enqueue: [
      {
        type: "analyze_page",
        payload: { dashboardId, widgetId, snapshotId, url: widget.url },
      },
    ],
  };
};
