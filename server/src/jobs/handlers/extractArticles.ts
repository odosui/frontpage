import * as articles from "../../models/articles";
import * as channels from "../../models/channels";
import { SMALL_MODEL } from "../../components/ai/models";
import { extractArticles } from "../../components/websites/extract";
import { deleteSnapshot, loadSnapshot } from "../../models/snapshots";
import { JobHandler } from "../types";

export type ExtractArticlesPayload = {
  dashboardId: string;
  channelId: string;
  snapshotId: string;
  /** Hash of the analyzed html, recorded so the next fetch can skip a no-op. */
  contentHash?: string;
  /** HTTP validators from the fetch, recorded only once this run succeeds. */
  etag?: string | null;
  lastModified?: string | null;
};

/** Run the model over a fetched page and store whatever articles are new. */
export const extractArticlesHandler: JobHandler = async (payload, { log }) => {
  const { dashboardId, channelId, snapshotId, contentHash, etag, lastModified } =
    payload as ExtractArticlesPayload;
  if (!dashboardId || !channelId || !snapshotId) {
    throw new Error(
      "extract_articles requires dashboardId, channelId and snapshotId",
    );
  }

  const snapshot = await loadSnapshot(snapshotId);
  if (!snapshot) {
    throw new Error(`page snapshot ${snapshotId} is gone — re-fetch the page`);
  }

  log(`analyzing ${snapshot.url} with ${SMALL_MODEL}`);
  const extracted = await extractArticles(snapshot.url, snapshot);

  // drop duplicates within the response; the insert filters against what is
  // already stored
  const seen = new Set<string>();
  const unique = extracted.filter((a) => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  const added = await articles.prepend(dashboardId, channelId, unique);

  // only now is it safe to remember this page as "already analyzed" — both the
  // hash and the HTTP validators, so a failed run always re-downloads
  await channels.saveValidators(dashboardId, channelId, {
    etag: etag ?? null,
    lastModified: lastModified ?? null,
  });
  if (contentHash) {
    await channels.saveContentHash(dashboardId, channelId, contentHash);
  }

  await deleteSnapshot(snapshotId);

  log(`extracted ${extracted.length}, ${added} new`);

  return {
    result: {
      url: snapshot.url,
      model: SMALL_MODEL,
      extracted: extracted.length,
      added,
    },
  };
};
