import * as articles from "../../models/articles";
import * as sources from "../../models/sources";
import { smallModel } from "../../components/ai/models";
import { extractArticles } from "../../components/websites/extract";
import { deleteSnapshot, loadSnapshot } from "../../models/snapshots";
import { JobHandler } from "../types";

export type ExtractArticlesPayload = {
  sourceId: string;
  snapshotId: string;
  /** Hash of the analyzed html, recorded so the next fetch can skip a no-op. */
  contentHash?: string;
  /** HTTP validators from the fetch, recorded only once this run succeeds. */
  etag?: string | null;
  lastModified?: string | null;
};

/** Run the model over a fetched page and store whatever articles are new. */
export const extractArticlesHandler: JobHandler = async (payload, { log }) => {
  const { sourceId, snapshotId, contentHash, etag, lastModified } =
    payload as ExtractArticlesPayload;
  if (!sourceId || !snapshotId) {
    throw new Error("extract_articles requires sourceId and snapshotId");
  }

  const snapshot = await loadSnapshot(snapshotId);
  if (!snapshot) {
    throw new Error(`page snapshot ${snapshotId} is gone — re-fetch the page`);
  }

  const model = await smallModel();
  log(`analyzing ${snapshot.url} with ${model}`);
  const extracted = await extractArticles(snapshot.url, snapshot, model);

  // drop duplicates within the response; the insert filters against what is
  // already stored
  const seen = new Set<string>();
  const unique = extracted.filter((a) => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  const { inserted } = await articles.prepend(sourceId, unique);

  // only now is it safe to remember this page as "already analyzed" — both the
  // hash and the HTTP validators, so a failed run always re-downloads
  await sources.saveValidators(sourceId, {
    etag: etag ?? null,
    lastModified: lastModified ?? null,
  });
  if (contentHash) await sources.saveContentHash(sourceId, contentHash);

  await deleteSnapshot(snapshotId);

  log(`extracted ${extracted.length}, ${inserted} new`);

  return {
    result: {
      url: snapshot.url,
      sourceId,
      model,
      extracted: extracted.length,
      added: inserted,
    },
  };
};
