import { fetchAndStore } from "../../components/articles/store";
import * as articles from "../../models/articles";
import { JobHandler } from "../types";

export type ExtractContentPayload = {
  articleId: number;
};

/**
 * Reads one article's page and stores its text. Queued per article by the
 * reader rather than run over the whole feed: fetching every article of every
 * source would be a different thing entirely — a crawl — and most articles are
 * never opened.
 *
 * The text belongs to the article, so it is stored once and every dashboard
 * reading that source gets it. Nothing is snapshotted; a retry downloads again.
 */
export const extractContentHandler: JobHandler = async (payload, { log }) => {
  const { articleId } = payload as ExtractContentPayload;
  if (!articleId) throw new Error("extract_content requires an articleId");

  const article = await articles.byId(Number(articleId));
  if (!article) throw new Error(`article ${articleId} no longer exists`);

  const stored = await fetchAndStore(article.id);

  log(
    stored.fromFeed
      ? `${article.url} would not be read, so its ${stored.chars} characters ` +
          `come from the feed's own copy of the article`
      : `read ${stored.chars} characters and ${stored.images} ` +
          `images from ${article.url}` +
          (stored.byline ? ` by ${stored.byline}` : ""),
  );

  return {
    result: {
      articleId: article.id,
      sourceId: article.sourceId,
      url: article.url,
      chars: stored.chars,
      images: stored.images,
      fromFeed: stored.fromFeed,
      byline: stored.byline,
      publishedAt: stored.publishedAt,
    },
  };
};
