import { BookIcon, DownloadIcon, SyncIcon } from '@primer/octicons-react'
import { type FeedArticle } from '../api'
import ArticleSource from './ArticleSource'
import ArticleTime from './ArticleTime'

type Props = {
  article: FeedArticle
  /** A job is reading the article's page right now. */
  busy: boolean
  onExtract: (articleId: number) => void
  onOpen: (articleId: number) => void
  /**
   * Show the agent's 1-10 score as a dot beside the time. Stories show it:
   * there it ranks the coverage inside one event. Latest leaves it out.
   */
  showImportance?: boolean
}

/**
 * One article, the same everywhere it is listed. A wire layout: when, in a
 * narrow column down the left so a list can be scanned by time; the headline
 * on a line of its own; who ran it, quietly, underneath; and the button that
 * fetches or opens its text at the end.
 *
 * Not filed into a story yet, the headline is set bold and a blue dot sits
 * beside the time — which only ever happens in Latest, since anything in a
 * story has been filed.
 */
const ArticleRow = ({
  article,
  busy,
  onExtract,
  onOpen,
  showImportance = false,
}: Props) => (
  <div className={`article-row${article.uncategorized ? ' is-unfiled' : ''}`}>
    <span className="article-row-when">
      <span className="article-row-marks">
        {/* not filed into a story yet: a blue dot beside the time, in the same
            place Stories put the importance dot, and a bold headline */}
        {article.uncategorized && (
          <span
            className="article-unfiled"
            role="img"
            aria-label="Not filed yet"
            title="Not filed into a story yet"
          />
        )}
        {showImportance && (
          <span
            className={`article-importance is-${band(article.importance)}`}
            title={
              article.importance === null
                ? 'Not scored yet'
                : `Importance ${article.importance}/10`
            }
          />
        )}
      </span>
      <ArticleTime article={article} />
    </span>
    <div className="article-row-main">
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="article-row-title"
        title={article.title}
      >
        {article.title}
      </a>
      <span className="article-row-meta">
        <ArticleSource article={article} />
      </span>
    </div>
    <ContentButton
      article={article}
      busy={busy}
      onExtract={onExtract}
      onOpen={onOpen}
    />
  </div>
)

/**
 * One button with three states: fetch the article's text, wait while a job
 * does it, or open what was stored. It keeps the same size throughout, so
 * nothing moves when the text arrives.
 */
const ContentButton = ({
  article,
  busy,
  onExtract,
  onOpen,
}: Omit<Props, 'showImportance'>) => {
  if (busy) {
    return (
      <span className="article-row-action is-busy" title="Reading the page…">
        <SyncIcon size={14} />
      </span>
    )
  }

  if (article.hasContent) {
    return (
      <button
        className="article-row-action has-content"
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
      className="article-row-action"
      onClick={() => onExtract(article.id)}
      title="Fetch this article's text"
      aria-label={`Fetch the text of ${article.title}`}
    >
      <DownloadIcon size={14} />
    </button>
  )
}

/**
 * The 1-10 score in five colour bands — the dot carries the reading, the
 * exact number is in its tooltip.
 */
function band(importance: number | null): string {
  if (importance === null) return 'none'
  if (importance <= 2) return 'lowest'
  if (importance <= 4) return 'low'
  if (importance <= 6) return 'mid'
  if (importance <= 8) return 'high'
  return 'highest'
}

export default ArticleRow
