import { type StoryFeedEntry } from './api'
import { timeAgo } from './utils/dates'

type Props = {
  stories: StoryFeedEntry[]
  hasArticles: boolean
}

/**
 * The categorized view: storyline label, story headline, then the articles
 * that make it up. Ordered by newest article, so the same storyline can head
 * several entries at different places in the list — it's a label, not a group.
 */
const Stories = ({ stories, hasArticles }: Props) => {
  if (stories.length === 0) {
    return (
      <p className="stories-placeholder">
        {hasArticles
          ? 'Nothing categorized yet — run the categorizing agent.'
          : 'No articles yet. Add a channel and refresh to start collecting.'}
      </p>
    )
  }

  return (
    <div className="stories">
      {stories.map((story) => (
        <article key={story.id} className="story">
          <h2 className="story-title">
            {story.storyline && (
              <span className="story-storyline">{story.storyline.title}</span>
            )}
            <span className="story-title-text">{story.title}</span>
          </h2>
          <div className="story-articles">
            {story.articles.map((article) => (
              <a
                key={`${article.channelId}:${article.url}`}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`story-article${
                  article.new ? ' story-article--new' : ''
                }`}
                title={article.title}
              >
                {article.title}
                <span className="story-article-meta">
                  {article.channelId} · {timeAgo(article.createdAt)}
                </span>
              </a>
            ))}
          </div>
        </article>
      ))}
    </div>
  )
}

export default Stories
