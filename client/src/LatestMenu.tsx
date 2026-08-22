import { ChevronDownIcon } from '@primer/octicons-react'
import { useEffect, useRef, useState } from 'react'
import { type FeedArticle } from './api'
import Feed from './Feed'

type Props = {
  articles: FeedArticle[]
  /** How many the dashboard holds in all, against how many are showing. */
  total: number
  onLoadMore: () => void
  loadingMore: boolean
  hasSources: boolean
  /** How many the categorizing agent has not looked at yet. */
  uncategorized: number
  running: boolean
  onRunAgent: () => void
  extracting: Set<number>
  onExtract: (articleId: number) => void
  onOpenContent: (articleId: number) => void
}

/**
 * The raw feed, folded into the top bar. It used to be a permanent column
 * beside the stories, but on the arc page the stories, facts, predictions and
 * chat all want the width — and the uncategorized queue is something you check
 * and dismiss, not something you read alongside.
 *
 * What stays visible is the count: an arc with a backlog says so on the button
 * without being opened.
 */
const LatestMenu = ({
  articles,
  total,
  onLoadMore,
  loadingMore,
  hasSources,
  uncategorized,
  running,
  onRunAgent,
  extracting,
  onExtract,
  onOpenContent,
}: Props) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="latest-menu" ref={ref}>
      <button
        className={`topbar-btn${open ? ' active' : ''}${
          uncategorized > 0 ? ' has-badge' : ''
        }`}
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        Latest
        {uncategorized > 0 && (
          <span
            className="topbar-badge"
            title={`${uncategorized} article${
              uncategorized > 1 ? 's' : ''
            } not filed yet`}
          >
            {uncategorized}
          </span>
        )}
        <ChevronDownIcon size={14} />
      </button>

      {open && (
        <div className="latest-dropdown">
          <Feed
            articles={articles}
            total={total}
            onLoadMore={onLoadMore}
            loadingMore={loadingMore}
            hasSources={hasSources}
            uncategorized={uncategorized}
            running={running}
            onRunAgent={onRunAgent}
            extracting={extracting}
            onExtract={onExtract}
            onOpenContent={onOpenContent}
          />
        </div>
      )}
    </div>
  )
}

export default LatestMenu
