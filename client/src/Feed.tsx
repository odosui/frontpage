import * as React from 'react'
import { type FeedArticle } from './api'
import { timeAgo } from './utils/dates'

type Props = {
  articles: FeedArticle[]
  hasChannels: boolean
}

/**
 * Every article on the dashboard in one column, newest first — the channel an
 * article came from is a label on it rather than a container around it.
 */
const Feed: React.FC<Props> = ({ articles, hasChannels }) => {
  if (articles.length === 0) {
    return (
      <p className="feed-placeholder">
        {hasChannels
          ? 'No articles yet — hit refresh.'
          : 'No channels yet. Add one to start collecting articles.'}
      </p>
    )
  }

  return (
    <ul className="feed-list">
      {articles.map((article) => (
        <li
          key={`${article.channelId}:${article.url}`}
          className={`feed-item${article.new ? ' feed-item--new' : ''}`}
        >
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="feed-link"
            title={article.title}
          >
            {article.image && (
              <img src={article.image} alt="" className="feed-image" />
            )}
            <span className="feed-text">
              <span className="feed-title">{article.title}</span>
              <span className="feed-meta">
                <span className="feed-channel">{article.channelId}</span>
                <span className="feed-time">{timeAgo(article.createdAt)}</span>
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}

export default Feed
