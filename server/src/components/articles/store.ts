import { PermanentError } from "../../utils/errors";
import * as articles from "../../models/articles";
import { fetchArticlePage } from "./download";
import { extractReadable } from "./readable";

export type StoredContent = {
  text: string;
  chars: number;
  images: number;
  byline: string | null;
  publishedAt: string | null;
  /**
   * True when the text is the feed's copy rather than the page's, because the
   * page could not be read. Usually shorter and sometimes only a teaser.
   */
  fromFeed: boolean;
};

/**
 * Reads one article's page and stores its text — the whole of what the reader's
 * "fetch content" button does, minus the queue.
 *
 * The job handler calls this because the reader is not waiting on it. The
 * agent calls it inline because it is: a turn cannot wait for a job it has no
 * way to poll, and an article it needs is one page, not a crawl.
 *
 * Not scoped to a dashboard: the text belongs to the article, and every
 * dashboard reading that source gets it once one of them asks for it.
 */
export async function fetchAndStore(
  articleId: number,
): Promise<StoredContent> {
  const article = await articles.byId(articleId);
  if (!article) {
    throw new Error(`article ${articleId} no longer exists`);
  }

  let readable;
  try {
    readable = extractReadable(
      await fetchArticlePage(article.url),
      article.url,
    );
  } catch (e) {
    // The page is not going to be read: it is behind a bot wall, it is gone,
    // or there is no article in it. Where the feed kept a copy of the body,
    // that copy is the article as far as we are ever going to have it — RBC
    // 401s every request we can make and publishes in full over rss — so it is
    // stored rather than losing the article entirely. A retryable failure (a
    // timeout, a 5xx) is not a fallback: the page may well answer next time.
    if (!(e instanceof PermanentError) || !article.feedContent) throw e;

    const saved = await articles.saveContent(article.id, article.feedContent, []);
    if (!saved) {
      throw new Error(`article ${article.id} vanished while it was being read`);
    }

    return {
      text: article.feedContent,
      chars: article.feedContent.length,
      images: 0,
      byline: null,
      publishedAt: null,
      fromFeed: true,
    };
  }

  const saved = await articles.saveContent(
    article.id,
    readable.text,
    readable.images,
  );
  if (!saved) {
    throw new Error(`article ${article.id} vanished while it was being read`);
  }

  return {
    text: readable.text,
    chars: readable.text.length,
    images: readable.images.length,
    byline: readable.byline,
    publishedAt: readable.publishedAt,
    fromFeed: false,
  };
}
