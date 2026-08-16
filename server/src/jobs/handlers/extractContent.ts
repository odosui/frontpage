import { fetchArticlePage } from "../../components/articles/download";
import { extractReadable } from "../../components/articles/readable";
import * as articles from "../../models/articles";
import { JobHandler } from "../types";

export type ExtractContentPayload = {
  dashboardId: string;
  articleId: number;
};

/**
 * Reads one article's page and stores its text. Queued per article by the
 * reader rather than run over the whole feed: fetching every article of every
 * channel would be a different thing entirely — a crawl — and most articles
 * are never opened.
 *
 * Nothing is snapshotted; a retry just downloads again.
 */
export const extractContentHandler: JobHandler = async (payload, { log }) => {
  const { dashboardId, articleId } = payload as ExtractContentPayload;
  if (!dashboardId || !articleId) {
    throw new Error("extract_content requires dashboardId and articleId");
  }

  const article = await articles.byId(dashboardId, Number(articleId));
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

  log(
    `read ${readable.text.length} characters and ${readable.images.length} ` +
      `images from ${article.url}` +
      (readable.byline ? ` by ${readable.byline}` : ""),
  );

  return {
    result: {
      articleId: article.id,
      url: article.url,
      chars: readable.text.length,
      images: readable.images.length,
      byline: readable.byline,
      publishedAt: readable.publishedAt,
    },
  };
};
