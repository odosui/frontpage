import { PlayIcon } from '@primer/octicons-react'
import { type FeedArticle } from './api'
import ArticleTime from './ui/ArticleTime'

type Props = {
  articles: FeedArticle[]
  hasChannels: boolean
  uncategorized: number
  running: boolean
  onRunAgent: () => void
}

const Feed = ({
  articles,
  hasChannels,
  uncategorized,
  running,
  onRunAgent,
}: Props) => {
  return (
    <div>
      <div className="feed-head">
        <h2 className="feed-heading">
          Latest
          {uncategorized > 0 && (
            <span className="feed-uncategorized">{uncategorized} uncat</span>
          )}
        </h2>
        <button
          className="feed-run"
          onClick={onRunAgent}
          disabled={running || uncategorized === 0}
          title={
            uncategorized === 0
              ? 'Everything is categorized'
              : `Categorize ${uncategorized} article${uncategorized > 1 ? 's' : ''}`
          }
        >
          <PlayIcon size={12} />
          {running ? 'Running…' : 'Run'}
        </button>
      </div>
      {articles.length === 0 ? (
        <p className="feed-placeholder">
          {hasChannels
            ? 'No articles yet — hit refresh.'
            : 'No channels yet. Add one to start collecting articles.'}
        </p>
      ) : (
        <div className="feed-list">
          {articles.map((article) => (
            <a
              key={`${article.channelId}:${article.url}`}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`feed-item${
                article.uncategorized ? ' feed-item--uncategorized' : ''
              }`}
              title={article.title}
            >
              {article.title}
              <span className="feed-meta">
                {article.channelId} · <ArticleTime article={article} />
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

export default Feed
