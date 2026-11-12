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
   * Mark the agent's high scores in the source line ("Key", "Major"). Stories
   * show it: there it ranks the coverage inside one event. Latest leaves it
   * out.
   */
  showImportance?: boolean
}

/**
 * One article, the same everywhere it is listed. A wire layout: when, in a
 * narrow column down the left so a list can be scanned by time; the headline
 * on a line of its own; who ran it, quietly, underneath; and the button that
 * fetches or opens its text at the end.
 *
 * Not filed into a story yet, the headline is set bold and a blue dot follows
 * it — which only ever happens in Latest, since anything in a story has been
 * filed.
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
      <ArticleTime article={article} />
    </span>
    <div className="article-row-main">
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="article-row-title"
      >
        {article.uncategorized ? <UnfiledTitle title={article.title} /> : article.title}
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
 * A headline with the blue "not filed yet" dot after its last word. The last
 * word and the dot are kept together, so a wrap can never leave the dot alone
 * at the start of a line.
 */
const UnfiledTitle = ({ title }: { title: string }) => {
  const cut = title.trimEnd().lastIndexOf(' ')
  const head = cut < 0 ? '' : title.slice(0, cut + 1)
  const last = cut < 0 ? title.trimEnd() : title.slice(cut + 1).trimEnd()
  return (
    <>
      {head}
      <span className="article-row-title-end">
        {last}
        <span
          className="article-unfiled"
          role="img"
          aria-label="Not filed yet"
          title="Not filed into a story yet"
        />
      </span>
    </>
  )
}

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
 * The agent's 1-10 score, as a word where it is worth one: "Key" for 7-8,
 * "Major" for 9-10. Anything lower, or not scored yet, shows nothing — a mark
 * on every row would make none of them stand out. The exact number is the
 * tooltip.
 */
const Importance = ({ score }: { score: number | null }) => {
  if (score === null || score < 7) return null
  const major = score >= 9
  return (
    <span
      className={`article-importance ${major ? 'is-major' : 'is-key'}`}
      title={`Importance ${score} of 10`}
    >
      {major ? 'Major' : 'Key'}
    </span>
  )
}

export default ArticleRow
