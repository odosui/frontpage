import { type FeedArticle } from '../api'

/**
 * Who an article came from.
 *
 * Usually that is just the source that fetched it. But a subreddit is not an
 * outlet — most of what it carries is a link to somebody else's article — so
 * where the two differ the publisher is what the reader wants to see, with the
 * subreddit demoted to a "via" that opens the discussion.
 */
const ArticleSource = ({ article }: { article: FeedArticle }) => {
  const publisher = article.publisher
  const carrier = article.sourceId

  return (
    <>
      <span className="article-source">{publisher ?? carrier ?? 'unsourced'}</span>
      {/* only worth saying when it is not the same fact twice */}
      {publisher && carrier && (
        <>
          {' · '}
          {article.viaUrl ? (
            <a
              className="article-via"
              href={article.viaUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open the discussion it was posted to"
              onClick={(e) => e.stopPropagation()}
            >
              via {carrier}
            </a>
          ) : (
            <span className="article-via">via {carrier}</span>
          )}
        </>
      )}
    </>
  )
}

export default ArticleSource
