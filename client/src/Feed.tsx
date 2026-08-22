import { BookIcon, DownloadIcon, PlayIcon, SyncIcon } from '@primer/octicons-react'
import { type FeedArticle } from './api'
import ArticleSource from './ui/ArticleSource'
import ArticleTime from './ui/ArticleTime'

type Props = {
  articles: FeedArticle[]
  /** How many the dashboard holds in all, against how many are showing. */
  total: number
  onLoadMore: () => void
  loadingMore: boolean
  hasSources: boolean
  uncategorized: number
  running: boolean
  onRunAgent: () => void
  extracting: Set<number>
  onExtract: (articleId: number) => void
  onOpenContent: (articleId: number) => void
}

/**
 * Everything this dashboard's sources have published, newest first, before
 * anything has been made of it. The ones nothing has filed yet are marked —
 * that mark is the whole point of the list, and the Run button next to it is
 * what clears them.
 */
const Feed = ({
  articles,
  total,
  onLoadMore,
  loadingMore,
  hasSources,
  uncategorized,
  running,
  onRunAgent,
  extracting,
  onExtract,
  onOpenContent,
}: Props) => {
  return (
    <div className="feed">
      <div className="feed-head">
        <h2 className="feed-heading">
          Latest
          {uncategorized > 0 && (
            <span className="feed-uncategorized">{uncategorized} unfiled</span>
          )}
        </h2>
        <button
          className="feed-run"
          onClick={onRunAgent}
          disabled={running || uncategorized === 0}
          title={
            uncategorized === 0
              ? 'Everything is filed'
              : `File ${uncategorized} article${uncategorized > 1 ? 's' : ''}`
          }
        >
          <PlayIcon size={12} />
          {running ? 'Running…' : 'Run'}
        </button>
      </div>

      {articles.length === 0 ? (
        <p className="feed-placeholder">
          {hasSources
            ? 'No articles yet — hit refresh on a source.'
            : 'No sources yet. Assign one to start collecting articles.'}
        </p>
      ) : (
        <div className="feed-list">
          {articles.map((article) => (
            <div
              key={article.id}
              className={`feed-item${
                article.uncategorized ? ' feed-item--uncategorized' : ''
              }`}
            >
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="feed-item-link"
                title={article.title}
              >
                {article.title}
              </a>
              <span className="feed-meta">
                <ArticleSource article={article} /> ·{' '}
                <ArticleTime article={article} />
              </span>
              <ContentButton
                article={article}
                busy={extracting.has(article.id)}
                onExtract={onExtract}
                onOpen={onOpenContent}
              />
            </div>
          ))}

          {/* the foot of the list: what is showing against what there is, and
              the click that fetches the next page. It sits inside the scroll
              rather than under it, so reaching the end of the list is what
              puts it in front of the reader */}
          {articles.length < total && (
            <button
              className="feed-more"
              onClick={onLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <SyncIcon size={12} className="feed-more-spin" />
              ) : null}
              {loadingMore
                ? 'Loading…'
                : `Load more · ${total - articles.length} older`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Fetch the article's text, wait for the job, or open what was stored. */
const ContentButton = ({
  article,
  busy,
  onExtract,
  onOpen,
}: {
  article: FeedArticle
  busy: boolean
  onExtract: (articleId: number) => void
  onOpen: (articleId: number) => void
}) => {
  if (busy) {
    return (
      <span className="feed-action is-busy" title="Reading the page…">
        <SyncIcon size={14} />
      </span>
    )
  }

  if (article.hasContent) {
    return (
      <button
        className="feed-action has-content"
        onClick={() => onOpen(article.id)}
        title="Read the stored text"
        aria-label={`Read the stored text of ${article.title}`}
      >
        <BookIcon size={14} />
      </button>
    )
  }

  return (
    <button
      className="feed-action"
      onClick={() => onExtract(article.id)}
      title="Fetch this article's text"
      aria-label={`Fetch the text of ${article.title}`}
    >
      <DownloadIcon size={14} />
    </button>
  )
}

export default Feed
