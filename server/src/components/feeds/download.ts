import { FetchValidators, readCapped, requestDocument } from "../http";

/** A feed is already a list of articles; there is no page to trim down. */
const XML_LIMIT = 2_000_000;

export type FeedDocument = {
  xml: string;
};

export type FetchFeedResult =
  | { notModified: true }
  | (FeedDocument & { notModified: false } & FetchValidators);

/**
 * Download a feed. Same conditional-GET dance as a front page — feeds are
 * polled far more often than they change, and most publishers do send etags.
 */
export async function fetchFeed(
  url: string,
  validators?: FetchValidators,
): Promise<FetchFeedResult> {
  const res = await requestDocument(url, {
    accept:
      "application/rss+xml, application/atom+xml, application/xml, text/xml",
    // text/html is deliberately not accepted: a feed url that starts answering
    // html is a misconfigured channel, and parsing it as a feed would quietly
    // find zero items instead of saying so
    allowedTypes: /xml|text\/plain/i,
    validators,
  });

  if (res.status === 304) return { notModified: true };

  const xml = await readCapped(res);

  return {
    notModified: false,
    xml: xml.slice(0, XML_LIMIT),
    etag: res.headers.get("etag"),
    lastModified: res.headers.get("last-modified"),
  };
}
