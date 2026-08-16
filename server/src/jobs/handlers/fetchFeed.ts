import { createHash } from "crypto";
import * as articles from "../../models/articles";
import * as channels from "../../models/channels";
import { fetchFeed } from "../../components/feeds/download";
import { parseFeed } from "../../components/feeds/parse";
import { JobHandler } from "../types";

export type FetchFeedPayload = {
  dashboardId: string;
  channelId: string;
};

/** How many articles a channel keeps. Mirrors extract_articles. */
const MAX_ITEMS = 100;

/**
 * The rss counterpart of fetch_page + extract_articles, and deliberately one
 * job rather than two: that pair is split so an expensive model call runs
 * separately from the download, and a feed needs no model at all. Nothing is
 * snapshotted either — parsing is cheap enough to redo on a retry.
 */
export const fetchFeedHandler: JobHandler = async (payload, { log }) => {
  const { dashboardId, channelId } = payload as FetchFeedPayload;
  if (!dashboardId || !channelId) {
    throw new Error("fetch_feed requires dashboardId and channelId");
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
  if (channel.kind !== "rss") {
    throw new Error(`fetch_feed cannot handle a ${channel.kind} channel`);
  }

  const state = await channels.getFetchState(dashboardId, channelId);
  // only trust the validators once a previous run actually stored articles,
  // otherwise a 304 would strand the channel empty
  const validators = state?.contentHash
    ? { etag: state.etag, lastModified: state.lastModified }
    : undefined;

  const feed = await fetchFeed(channel.url, validators);

  // nothing new to store, but the reader has seen what is already there
  if (feed.notModified) {
    const read = await articles.markRead(dashboardId, channelId);
    log(`${channel.url} unchanged (304) — ${read} marked read`);
    return { result: { url: channel.url, unchanged: "not-modified", read } };
  }

  const contentHash = createHash("sha256").update(feed.xml).digest("hex");

  if (state?.contentHash === contentHash) {
    const read = await articles.markRead(dashboardId, channelId);
    log(`${channel.url} unchanged (same content) — ${read} marked read`);
    return { result: { url: channel.url, unchanged: "same-content", read } };
  }

  const items = parseFeed(feed.xml, channel.url);
  if (items.length === 0) {
    // a feed that parses to nothing is a broken channel, not a quiet day —
    // failing keeps the validators unsaved so the next run re-downloads
    throw new Error(`no items found in feed ${channel.url}`);
  }

  const stored = await articles.prepend(
    dashboardId,
    channelId,
    items,
    MAX_ITEMS,
  );
  const added = stored.filter((a) => a.new).length;

  // only now is it safe to remember this feed as "already read"
  await channels.saveValidators(dashboardId, channelId, {
    etag: feed.etag ?? null,
    lastModified: feed.lastModified ?? null,
  });
  await channels.saveContentHash(dashboardId, channelId, contentHash);

  log(`parsed ${items.length} items from ${channel.url}, ${added} new`);

  return {
    result: { url: channel.url, parsed: items.length, added },
  };
};
