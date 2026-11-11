import { PlayIcon, SyncIcon } from '@primer/octicons-react'
import { type FeedArticle } from './api'
import ArticleRow from './ui/ArticleRow'

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
      <header className="col-head">
        <p className="col-dek">
          Everything the sources collected, newest first
          {uncategorized > 0 && (
            <span className="feed-uncategorized">
              {uncategorized} not filed yet
            </span>
          )}
        </p>
        <button
          className={`col-run${running ? ' is-busy' : ''}`}
          onClick={onRunAgent}
          disabled={running || uncategorized === 0}
          title={
            uncategorized === 0
              ? 'Everything is filed'
              : `File ${uncategorized} article${uncategorized > 1 ? 's' : ''} into stories`
          }
        >
          {running ? (
            <SyncIcon size={12} className="col-run-spin" />
          ) : (
            <PlayIcon size={12} />
          )}
          {running ? 'Filing' : 'File into stories'}
        </button>
      </header>

      {articles.length === 0 ? (
        <div className="col-body">
          <p className="feed-placeholder">
            {hasSources
              ? 'No articles yet — hit refresh on a source.'
              : 'No sources yet. Assign one to start collecting articles.'}
          </p>
        </div>
      ) : (
        <div className="col-body feed-list">
          {articles.map((article) => (
            <ArticleRow
              key={article.id}
              article={article}
              busy={extracting.has(article.id)}
              onExtract={onExtract}
              onOpen={onOpenContent}
            />
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

export default Feed
