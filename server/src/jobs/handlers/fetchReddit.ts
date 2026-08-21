import * as articles from "../../models/articles";
import * as sources from "../../models/sources";
import { fetchSubreddit } from "../../components/reddit/download";
import {
  DEFAULT_MIN_SCORE,
  subredditOf,
  toArticles,
} from "../../components/reddit/parse";
import { JobHandler } from "../types";

export type FetchRedditPayload = {
  sourceId: string;
};

/**
 * Pulls a subreddit's newest posts and stores the ones that cleared the score
 * the reader set on this source.
 *
 * One job rather than the fetch/analyze pair a web page needs: reddit hands us
 * structured posts, so there is no model call to keep separate, and nothing
 * worth snapshotting.
 *
 * A link post is stored as the article it points at, not as the thread — the
 * destination's url, so reading the text later reads the piece rather than the
 * comments. `parse.toArticles` does that sorting; see the note there.
 */
export const fetchRedditHandler: JobHandler = async (payload, { log }) => {
  const { sourceId } = payload as FetchRedditPayload;
  if (!sourceId) throw new Error("fetch_reddit requires a sourceId");

  const source = await sources.get(sourceId);
  if (!source) throw new Error(`source ${sourceId} no longer exists`);
  if (source.kind !== "reddit") {
    throw new Error(`fetch_reddit cannot handle a ${source.kind} source`);
  }

  const subreddit = subredditOf(source.url);
  if (!subreddit) {
    throw new Error(`source ${sourceId} has no subreddit configured`);
  }

  const minScore = source.config.minScore ?? DEFAULT_MIN_SCORE;

  const posts = await fetchSubreddit(subreddit);
  const fresh = toArticles(posts, minScore);

  const { inserted } = await articles.prepend(sourceId, fresh);

  // Nothing here is conditional on a validator: reddit sends no etag worth
  // trusting, and the listing changes on every vote anyway. Stamping the fetch
  // is all the state a reddit source keeps.
  await sources.saveValidators(sourceId, {});

  const links = fresh.filter((a) => a.publisher).length;
  log(
    `r/${subreddit}: ${posts.length} posts, ${fresh.length} at ${minScore}+ ` +
      `points, ${inserted} new (${links} linking off reddit)`,
  );

  return {
    result: {
      sourceId,
      subreddit,
      minScore,
      seen: posts.length,
      qualified: fresh.length,
      added: inserted,
      links,
    },
  };
};
