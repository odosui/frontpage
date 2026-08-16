import * as articles from "../../models/articles";
import { fetchArticlePage } from "./download";
import { extractReadable } from "./readable";

export type StoredContent = {
  text: string;
  chars: number;
  images: number;
  byline: string | null;
  publishedAt: string | null;
};

/**
 * Reads one article's page and stores its text — the whole of what the reader's
 * "fetch content" button does, minus the queue.
 *
 * The job handler calls this because the reader is not waiting on it. The
 * agent calls it inline because it is: a turn cannot wait for a job it has no
 * way to poll, and an article it needs is one page, not a crawl.
 */
export async function fetchAndStore(
  dashboardId: string,
  articleId: number,
): Promise<StoredContent> {
  const article = await articles.byId(dashboardId, articleId);
  if (!article) {
    throw new Error(`article ${dashboardId}/${articleId} no longer exists`);
  }

  const html = await fetchArticlePage(article.url);
  const readable = extractReadable(html, article.url);

  const saved = await articles.saveContent(
    dashboardId,
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
  };
}
