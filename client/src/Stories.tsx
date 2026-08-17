import { BookIcon, DownloadIcon, SyncIcon } from '@primer/octicons-react'
import { type StoryFeedEntry, type Storyline } from './api'
import ArticleTime from './ui/ArticleTime'
import StoryMenu from './ui/StoryMenu'

type Props = {
  stories: StoryFeedEntry[]
  hasArticles: boolean
  /** Articles with an extract_content job in flight right now. */
  extracting: Set<number>
  onExtract: (articleId: number) => void
  onOpenContent: (articleId: number) => void
  /** Every arc a story can be moved to; empty where moving is not offered. */
  storylines?: Storyline[]
  /** Left out on the storyline page, where every story is already in place. */
  onMove?: (
    storyId: number,
    to: { storylineId?: number | null; storylineTitle?: string },
  ) => void
}

/**
 * The categorized view: storyline label, story headline, then the articles
 * that make it up. Ordered by newest article, so the same storyline can head
 * several entries at different places in the list — it's a label, not a group.
 */
const Stories = ({
  stories,
  hasArticles,
  extracting,
  onExtract,
  onOpenContent,
  storylines = [],
  onMove,
}: Props) => {
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
              <span className="story-storyline" title={story.storyline.title}>
                {story.storyline.title}
              </span>
            )}
            <span className="story-title-text">{story.title}</span>
            {onMove && (
              <StoryMenu
                current={story.storyline}
                storylines={storylines}
                onMove={(storylineId) => onMove(story.id, { storylineId })}
                onCreate={(storylineTitle) =>
                  onMove(story.id, { storylineTitle })
                }
              />
            )}
          </h2>
          <div className="story-articles">
            {story.articles.map((article) => (
              <div
                key={`${article.channelId}:${article.url}`}
                className="story-article-row"
              >
                <span
                  className={`story-article-dot is-${band(article.importance)}`}
                  title={
                    article.importance === null
                      ? 'Not scored yet'
                      : `Importance ${article.importance}/10`
                  }
                />
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="story-article"
                  title={article.title}
                >
                  {article.title}
                </a>
                {article.tags.map((tag) => (
                  <span key={tag} className="story-tag">
                    {tag}
                  </span>
                ))}
                <span className="story-article-meta">
                  {article.channelId} · <ArticleTime article={article} />
                </span>
                <ContentButton
                  article={article}
                  busy={extracting.has(article.id)}
                  onExtract={onExtract}
                  onOpen={onOpenContent}
                />
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  )
}

/**
 * One button with three states: fetch the article's text, wait while a job
 * does it, or open what was stored. It keeps the same size throughout, so the
 * meta line does not reflow when the text arrives.
 */
const ContentButton = ({
  article,
  busy,
  onExtract,
  onOpen,
}: {
  article: StoryFeedEntry['articles'][number]
  busy: boolean
  onExtract: (articleId: number) => void
  onOpen: (articleId: number) => void
}) => {
  if (busy) {
    return (
      <span className="story-article-action is-busy" title="Reading the page…">
        <SyncIcon size={14} />
      </span>
    )
  }

  if (article.hasContent) {
    return (
      <button
        className="story-article-action has-content"
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
      className="story-article-action"
      onClick={() => onExtract(article.id)}
      title="Fetch this article's text"
      aria-label={`Fetch the text of ${article.title}`}
    >
      <DownloadIcon size={14} />
    </button>
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
