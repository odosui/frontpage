import { BookIcon, DownloadIcon, SyncIcon } from '@primer/octicons-react'
import { type StoryFeedEntry } from './api'
import ArticleTime from './ui/ArticleTime'
import StoryMenu from './ui/StoryMenu'

type Props = {
  stories: StoryFeedEntry[]
  /** Whether this dashboard reads any source at all — for the empty state. */
  hasSources: boolean
  hasArticles: boolean
  /** Articles with an extract_content job in flight right now. */
  extracting: Set<number>
  onExtract: (articleId: number) => void
  onOpenContent: (articleId: number) => void
  onRename?: (storyId: number, title: string) => void
  onDelete?: (storyId: number) => void
}

/**
 * The arc, as events: one entry per story, newest first by its newest article,
 * with the articles that make it up under each.
 *
 * There is no storyline label any more — the dashboard is the arc, so every
 * story on this page already belongs to it.
 */
const Stories = ({
  stories,
  hasSources,
  hasArticles,
  extracting,
  onExtract,
  onOpenContent,
  onRename,
  onDelete,
}: Props) => {
  if (stories.length === 0) {
    return <p className="stories-placeholder">{emptyState(hasSources, hasArticles)}</p>
  }

  return (
    <div className="stories">
      {stories.map((story) => (
        <article key={story.id} className="story">
          <h2 className="story-title">
            <span className="story-title-text">{story.title}</span>
            <span className="story-count">{story.articles.length}</span>
            {(onRename || onDelete) && (
              <StoryMenu
                title={story.title}
                onRename={
                  onRename ? (title) => onRename(story.id, title) : undefined
                }
                onDelete={onDelete ? () => onDelete(story.id) : undefined}
              />
            )}
          </h2>
          <div className="story-articles">
            {story.articles.map((article) => (
              <div key={article.id} className="story-article-row">
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
                  {article.sourceId} · <ArticleTime article={article} />
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

/** Which of the three ways this arc can be empty the reader is looking at. */
function emptyState(hasSources: boolean, hasArticles: boolean): string {
  if (!hasSources) {
    return 'No sources yet. Assign one from the top bar to start collecting articles.'
  }
  if (!hasArticles) return 'No articles yet — hit refresh on a source.'
  return 'Nothing filed under this dashboard yet — run the categorizing agent.'
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
