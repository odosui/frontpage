import { useEffect, useRef, useState } from 'react'
import { type Source } from './api'
import ChevronDownIcon from './icons/ChevronDownIcon'
import PlusIcon from './icons/PlusIcon'
import RefreshIcon from './icons/RefreshIcon'
import TrashIcon from './icons/TrashIcon'

type Props = {
  sources: Source[]
  refreshing: Set<string>
  errors: Map<string, string>
  isRefreshingAll: boolean
  onRefresh: (id: string) => void
  onRemove: (id: string) => void
  onAdd: () => void
  onRefreshAll: () => void
}

/**
 * The sources this dashboard reads, with their per-source actions.
 *
 * Sources are independent now: the same outlet can feed several arcs, and
 * fetching it serves all of them at once. So the destructive action here is
 * "stop reading", not "delete" — the source itself outlives any one dashboard,
 * and deleting it outright is a decision for the settings page.
 */
const SourcesMenu = ({
  sources,
  refreshing,
  errors,
  isRefreshingAll,
  onRefresh,
  onRemove,
  onAdd,
  onRefreshAll,
}: Props) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="sources-menu" ref={ref}>
      <button
        className={`topbar-btn${errors.size > 0 ? ' has-error' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {sources.length} source{sources.length === 1 ? '' : 's'}
        <ChevronDownIcon />
      </button>

      {open && (
        <div className="sources-dropdown">
          {sources.length === 0 && (
            <div className="sources-empty">No sources yet</div>
          )}
          {sources.map((source) => (
            <div key={source.id} className="sources-item">
              <span className="sources-item-name" title={source.url}>
                {source.name}
                <span className="sources-item-kind">{source.kind}</span>
                {/* a source read by more than one arc: refreshing it here
                    fills the others too, and dropping it leaves them alone */}
                {source.dashboardCount > 1 && (
                  <span
                    className="sources-item-shared"
                    title={`Read by ${source.dashboardCount} dashboards`}
                  >
                    ×{source.dashboardCount}
                  </span>
                )}
              </span>
              {errors.get(source.id) && (
                <span
                  className="sources-item-error"
                  title={errors.get(source.id)}
                >
                  failed
                </span>
              )}
              <div className="sources-item-actions">
                <button
                  className={`sources-action${
                    refreshing.has(source.id) ? ' is-refreshing' : ''
                  }`}
                  title="Refresh"
                  disabled={refreshing.has(source.id)}
                  onClick={() => onRefresh(source.id)}
                >
                  <RefreshIcon />
                </button>
                <button
                  className="sources-action sources-action--danger"
                  title="Stop reading this source here"
                  onClick={() => onRemove(source.id)}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}

          <div className="sources-divider" />

          <button
            className="sources-menu-btn"
            onClick={() => {
              setOpen(false)
              onAdd()
            }}
          >
            <PlusIcon />
            Add source
          </button>
          <button
            className={`sources-menu-btn${
              isRefreshingAll ? ' is-refreshing' : ''
            }`}
            disabled={isRefreshingAll || sources.length === 0}
            onClick={() => {
              setOpen(false)
              onRefreshAll()
            }}
          >
            <RefreshIcon />
            Refresh all
          </button>
        </div>
      )}
    </div>
  )
}

export default SourcesMenu
