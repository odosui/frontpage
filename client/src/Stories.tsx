import {
  BookIcon,
  DownloadIcon,
  PlayIcon,
  SyncIcon,
} from '@primer/octicons-react'
import { type StoryFeedEntry } from './api'
import ArticleSource from './ui/ArticleSource'
import ArticleTime from './ui/ArticleTime'
import StoryMenu from './ui/StoryMenu'

type Props = {
  stories: StoryFeedEntry[]
  /**
   * How many stories this dashboard holds, which is not how many are on
   * screen: the page asks for the newest hundred. Shown as "100 of 214" so a
   * capped column says so rather than looking like the whole arc.
   */
  total: number
  /** Whether this dashboard reads any source at all — for the empty state. */
  hasSources: boolean
  hasArticles: boolean
  /** Articles with an extract_content job in flight right now. */
  extracting: Set<number>
  onExtract: (articleId: number) => void
  onOpenContent: (articleId: number) => void
  onRename?: (storyId: number, title: string) => void
  onDelete?: (storyId: number) => void
  /** Queues the facts agent over these stories. */
  onRunFacts: () => void
  /** Whether that run is in flight right now. */
  runningFacts: boolean
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
  total,
  hasSources,
  hasArticles,
  extracting,
  onExtract,
  onOpenContent,
  onRename,
  onDelete,
  onRunFacts,
  runningFacts,
}: Props) => {
  // the shared column header, the same one facts, predictions and chat carry,
  // so the four read as four panes of one page rather than a list with three
  // panes beside it
  const head = (
    <header className="col-head">
      <h2 className="col-heading">
        Stories
        {stories.length > 0 && (
          <span className="col-count">
            {total > stories.length
              ? `${stories.length} of ${total}`
              : stories.length}
          </span>
        )}
      </h2>
      <button
        className={`stories-run${runningFacts ? ' is-busy' : ''}`}
        onClick={onRunFacts}
        disabled={runningFacts || stories.length === 0}
        title={
          stories.length === 0
            ? 'Nothing filed to read yet'
            : runningFacts
              ? 'Reading the stories…'
              : 'Read these stories and update the facts'
        }
      >
        {runningFacts ? (
          <SyncIcon size={12} className="stories-run-spin" />
        ) : (
          <PlayIcon size={12} />
        )}
        {runningFacts ? 'Running' : 'Run Facts'}
      </button>
    </header>
  )

  if (stories.length === 0) {
    return (
      <div className="stories">
        {head}
        <div className="col-body">
          <p className="stories-placeholder">
            {emptyState(hasSources, hasArticles)}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="stories">
      {head}
      <div className="col-body stories-list">
        {stories.map((story) => (
          <article key={story.id} className="story">
            <h2 className="story-title">
              {/* one line, cut with an ellipsis; the whole of it is in the
                  tooltip for the titles that do not fit */}
              <span className="story-title-text" title={story.title}>
                {story.title}
              </span>
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
                  {/* one run of text, not a stack of boxes: the headline, who
                    ran it and when, and the button, all in a single flow that
                    wraps where the words do. The meta is kept unbreakable so
                    "NOVAYA · 6h" travels to the next line together rather than
                    splitting across it. Tags are still collected and still
                    filed — just not shown here. */}
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="story-article"
                    title={article.title}
                  >
                    {article.title}
                  </a>{' '}
                  <span className="story-article-meta">
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
            </div>
          </article>
        ))}
      </div>
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
