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
   * Show the agent's 1-10 score as a meter in the source line. Stories show
   * it: there it ranks the coverage inside one event. Latest leaves it out.
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
        {/* not filed into a story yet: a blue dot beside the time, and a bold
            headline. The only mark that ever sits here, in either tab */}
        {article.uncategorized && (
          <span
            className="article-unfiled"
            role="img"
            aria-label="Not filed yet"
            title="Not filed into a story yet"
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
      >
        {article.title}
      </a>
      <span className="article-row-meta">
        <ArticleSource article={article} />
        {showImportance && <Importance score={article.importance} />}
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

const BARS = [1, 2, 3, 4, 5]

/**
 * The agent's 1-10 score as a signal meter: five rising bars, as many filled
 * as the score earns, coloured grey to red by the same steps. Never blue —
 * blue beside the time means "not filed". Unscored, every bar is empty; the
 * exact number is the tooltip either way.
 */
const Importance = ({ score }: { score: number | null }) => {
  const level = score === null ? 0 : Math.max(1, Math.ceil(score / 2))
  const label = score === null ? 'Not scored yet' : `Importance ${score} of 10`
  return (
    <span
      className={`article-importance is-${level}`}
      role="img"
      aria-label={label}
      title={label}
    >
      {BARS.map((bar) => (
        <span
          key={bar}
          className={`article-importance-bar${bar <= level ? ' is-on' : ''}`}
        />
      ))}
    </span>
  )
}

export default ArticleRow
