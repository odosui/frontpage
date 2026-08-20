import { createHash } from "crypto";
import * as articles from "../../models/articles";
import * as sources from "../../models/sources";
import { fetchFeed } from "../../components/feeds/download";
import { parseFeed, recentOnly } from "../../components/feeds/parse";
import { JobHandler } from "../types";

export type FetchFeedPayload = {
  sourceId: string;
};

/** How far back into a feed is worth storing. See `recentOnly`. */
const MAX_AGE_DAYS = 5;

/**
 * The rss counterpart of fetch_page + extract_articles, and deliberately one
 * job rather than two: that pair is split so an expensive model call runs
 * separately from the download, and a feed needs no model at all. Nothing is
 * snapshotted either — parsing is cheap enough to redo on a retry.
 */
export const fetchFeedHandler: JobHandler = async (payload, { log }) => {
  const { sourceId } = payload as FetchFeedPayload;
  if (!sourceId) throw new Error("fetch_feed requires a sourceId");

  const source = await sources.get(sourceId);
  if (!source) throw new Error(`source ${sourceId} no longer exists`);
  if (!source.url) throw new Error(`source ${sourceId} has no url configured`);
  if (source.kind !== "rss") {
    throw new Error(`fetch_feed cannot handle a ${source.kind} source`);
  }

  const state = await sources.getFetchState(sourceId);
  // only trust the validators once a previous run actually stored articles,
  // otherwise a 304 would strand the source empty
  const validators = state?.contentHash
    ? { etag: state.etag, lastModified: state.lastModified }
    : undefined;

  const feed = await fetchFeed(source.url, validators);

  // nothing new to store
  if (feed.notModified) {
    log(`${source.url} unchanged (304)`);
    return { result: { url: source.url, unchanged: "not-modified" } };
  }

  const contentHash = createHash("sha256").update(feed.xml).digest("hex");

  if (state?.contentHash === contentHash) {
    log(`${source.url} unchanged (same content)`);
    return { result: { url: source.url, unchanged: "same-content" } };
  }

  const items = parseFeed(feed.xml, source.url);
  if (items.length === 0) {
    // a feed that parses to nothing is a broken source, not a quiet day —
    // failing keeps the validators unsaved so the next run re-downloads
    throw new Error(`no items found in feed ${source.url}`);
  }

  // an empty list here is a quiet week, not a broken source, so it goes
  // through prepend as normal — which lets the validators be saved below,
  // where the throw above deliberately does not
  const fresh = recentOnly(items, MAX_AGE_DAYS);

  const added = await articles.prepend(sourceId, fresh);

  // only now is it safe to remember this feed as "already read"
  await sources.saveValidators(sourceId, {
    etag: feed.etag ?? null,
    lastModified: feed.lastModified ?? null,
  });
  await sources.saveContentHash(sourceId, contentHash);

  const stale = items.length - fresh.length;
  log(
    `parsed ${items.length} items from ${source.url}, ${added} new` +
      (stale ? `, ${stale} older than ${MAX_AGE_DAYS} days` : ""),
  );

  return {
    result: { url: source.url, sourceId, parsed: items.length, stale, added },
  };
};
