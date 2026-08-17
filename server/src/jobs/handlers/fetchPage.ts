import { createHash } from "crypto";
import * as channels from "../../models/channels";
import { fetchPage } from "../../components/websites/download";
import { saveSnapshot } from "../../models/snapshots";
import { JobHandler } from "../types";

export type FetchPagePayload = {
  dashboardId: string;
  channelId: string;
};

export const fetchPageHandler: JobHandler = async (payload, { log }) => {
  const { dashboardId, channelId } = payload as FetchPagePayload;
  if (!dashboardId || !channelId) {
    throw new Error("fetch_page requires dashboardId and channelId");
  }

  const channel = await channels.get(dashboardId, channelId);
  if (!channel) {
    throw new Error(`channel ${dashboardId}/${channelId} no longer exists`);
  }
  if (!channel.url) {
    throw new Error(
      `channel ${dashboardId}/${channelId} has no url configured`,
    );
  }
  if (channel.kind !== "web") {
    throw new Error(`fetch_page cannot handle a ${channel.kind} channel`);
  }

  const state = await channels.getFetchState(dashboardId, channelId);
  // only trust the validators if a previous analysis actually completed,
  // otherwise a 304 would strand the channel with no articles
  const validators = state?.contentHash
    ? { etag: state.etag, lastModified: state.lastModified }
    : undefined;

  const page = await fetchPage(channel.url, validators);

  // nothing new to store
  if (page.notModified) {
    log(`${channel.url} unchanged (304), skipping analysis`);
    return { result: { url: channel.url, unchanged: "not-modified" } };
  }

  const contentHash = createHash("sha256").update(page.html).digest("hex");

  if (state?.contentHash === contentHash) {
    log(`${channel.url} unchanged (same content), skipping analysis`);
    return { result: { url: channel.url, unchanged: "same-content" } };
  }

  const snapshotId = await saveSnapshot(channel.url, page);

  log(
    `fetched ${channel.url} — ${page.html.length} chars, ${page.hrefs.length} links`,
  );

  return {
    result: {
      url: channel.url,
      snapshotId,
      htmlChars: page.html.length,
      links: page.hrefs.length,
    },
    enqueue: [
      {
        type: "extract_articles",
        // the validators ride along and are only recorded once the articles
        // are stored: saving them here would make the next fetch answer 304
        // and skip analysis for good if extraction never completed
        payload: {
          dashboardId,
          channelId,
          snapshotId,
          contentHash,
          etag: page.etag ?? null,
          lastModified: page.lastModified ?? null,
          url: channel.url,
        },
      },
    ],
  };
};
