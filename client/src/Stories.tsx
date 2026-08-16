import { type StoryFeedEntry } from './api'
import ArticleTime from './ui/ArticleTime'

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
              <div key={`${article.channelId}:${article.url}`}>
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`story-article${
                    article.new ? ' story-article--new' : ''
                  }`}
                  title={article.title}
                >
                  <span
                    className={`story-article-dot is-${band(article.importance)}`}
                    title={
                      article.importance === null
                        ? 'Not scored yet'
                        : `Importance ${article.importance}/10`
                    }
                  />
                  {article.title}
                  {article.tags.map((tag) => (
                    <span key={tag} className="story-tag">
                      {tag}
                    </span>
                  ))}
                  <span className="story-article-meta">
                    {article.channelId} · <ArticleTime article={article} />
                  </span>
                </a>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  )
}

/**
 * The 1-10 score in five colour bands — the dot carries the reading, the exact
 * number is in its tooltip.
 */
function band(importance: number | null): string {
  if (importance === null) return 'none'
  if (importance <= 2) return 'lowest'
  if (importance <= 4) return 'low'
  if (importance <= 6) return 'mid'
  if (importance <= 8) return 'high'
  return 'highest'
}

export default Stories
