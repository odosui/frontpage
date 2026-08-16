import { fetchAndStore } from "../../components/articles/store";
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

  const stored = await fetchAndStore(dashboardId, article.id);

  log(
    `read ${stored.chars} characters and ${stored.images} ` +
      `images from ${article.url}` +
      (stored.byline ? ` by ${stored.byline}` : ""),
  );

  return {
    result: {
      articleId: article.id,
      url: article.url,
      chars: stored.chars,
      images: stored.images,
      byline: stored.byline,
      publishedAt: stored.publishedAt,
    },
  };
};
