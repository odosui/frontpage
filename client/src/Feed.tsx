import { type FeedArticle } from './api'
import { timeAgo } from './utils/dates'

type Props = {
  articles: FeedArticle[]
  hasChannels: boolean
}

const Feed = ({ articles, hasChannels }: Props) => {
  return (
    <div>
      <h2 className="feed-heading">Latest</h2>
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
              className={`feed-item${article.new ? ' feed-item--new' : ''}`}
              title={article.title}
            >
              {article.title}
              <span className="feed-meta">
                {article.channelId} · {timeAgo(article.createdAt)}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

export default Feed
