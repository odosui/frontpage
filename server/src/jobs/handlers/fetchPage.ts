import { createHash } from "crypto";
import * as sources from "../../models/sources";
import { fetchPage } from "../../components/websites/download";
import { saveSnapshot } from "../../models/snapshots";
import { JobHandler } from "../types";

export type FetchPagePayload = {
  sourceId: string;
};

/**
 * A source is fetched once, whoever is reading it: several dashboards sharing
 * an outlet share this job and the articles it stores.
 */
export const fetchPageHandler: JobHandler = async (payload, { log }) => {
  const { sourceId } = payload as FetchPagePayload;
  if (!sourceId) throw new Error("fetch_page requires a sourceId");

  const source = await sources.get(sourceId);
  if (!source) throw new Error(`source ${sourceId} no longer exists`);
  if (!source.url) throw new Error(`source ${sourceId} has no url configured`);
  if (source.kind !== "web") {
    throw new Error(`fetch_page cannot handle a ${source.kind} source`);
  }

  const state = await sources.getFetchState(sourceId);
  // only trust the validators if a previous analysis actually completed,
  // otherwise a 304 would strand the source with no articles
  const validators = state?.contentHash
    ? { etag: state.etag, lastModified: state.lastModified }
    : undefined;

  const page = await fetchPage(source.url, validators);

  // nothing new to store
  if (page.notModified) {
    log(`${source.url} unchanged (304), skipping analysis`);
    return { result: { url: source.url, unchanged: "not-modified" } };
  }

  const contentHash = createHash("sha256").update(page.html).digest("hex");

  if (state?.contentHash === contentHash) {
    log(`${source.url} unchanged (same content), skipping analysis`);
    return { result: { url: source.url, unchanged: "same-content" } };
  }

  const snapshotId = await saveSnapshot(source.url, page);

  log(
    `fetched ${source.url} — ${page.html.length} chars, ${page.hrefs.length} links`,
  );

  return {
    result: {
      url: source.url,
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
          sourceId,
          snapshotId,
          contentHash,
          etag: page.etag ?? null,
          lastModified: page.lastModified ?? null,
          url: source.url,
        },
      },
    ],
  };
};
