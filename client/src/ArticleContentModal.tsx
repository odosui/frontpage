import { useEffect, useState } from 'react'
import api, { type ArticleContent, type ArticleImage } from './api'
import GenericModal from './ui/GenericModal'
import { formatWhen } from './utils/dates'

type Props = {
  dashboardId: string
  /** The article to show; null closes the modal. */
  articleId: number | null
  onClose: () => void
}

/**
 * The article's own text, as the extract_content job stored it. Fetched when
 * the modal opens rather than carried in the feed — the text is far larger
 * than everything else on the page put together, and most of it is never read.
 */
const ArticleContentModal = ({ dashboardId, articleId, onClose }: Props) => {
  const [article, setArticle] = useState<ArticleContent | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (articleId === null) return

    // a slow response for an article the reader has already closed must not
    // land in the modal they opened next
    let current = true
    setArticle(null)
    setError(null)

    api
      .getArticleContent(dashboardId, articleId)
      .then((data: ArticleContent) => current && setArticle(data))
      .catch((e: Error) => current && setError(e.message))

    return () => {
      current = false
    }
  }, [dashboardId, articleId])

  return (
    <GenericModal
      isOpen={articleId !== null}
      onClose={onClose}
      contentLabel="Article text"
      contentClass="article-content"
    >
      {error && <p className="article-content-error">{error}</p>}

      {!error && !article && <p className="article-content-error">Loading…</p>}

      {article && (
        <>
          <h2 className="article-content-title">
            <a href={article.url} target="_blank" rel="noopener noreferrer">
              {article.title}
            </a>
          </h2>
          <p className="article-content-meta">
            {article.sourceId} · read {formatWhen(article.contentAt)}
          </p>
          {article.content.split('\n\n').map((paragraph, i) => (
            <p key={i} className="article-content-p">
              {paragraph}
            </p>
          ))}

          {article.images.length > 0 && (
            <div className="article-content-images">
              {article.images.map((image) => (
                <ArticleFigure key={image.url} image={image} />
              ))}
            </div>
          )}
        </>
      )}
    </GenericModal>
  )
}

/**
 * One picture, loaded straight from the publisher. A url that has since moved
 * or that blocks hotlinking would otherwise leave a broken-image icon behind,
 * so a figure that fails to load takes itself off the page.
 */
const ArticleFigure = ({ image }: { image: ArticleImage }) => {
  const [failed, setFailed] = useState(false)
  if (failed) return null

  const label = image.caption ?? image.alt

  return (
    <figure className="article-content-figure">
      <img
        src={image.url}
        alt={image.alt ?? ''}
        loading="lazy"
        onError={() => setFailed(true)}
      />
      {label && <figcaption>{label}</figcaption>}
    </figure>
  )
}

export default ArticleContentModal
