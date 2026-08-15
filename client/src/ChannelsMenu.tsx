import { useEffect, useRef, useState } from 'react'
import { type Channel } from './api'
import ChevronDownIcon from './icons/ChevronDownIcon'
import PlusIcon from './icons/PlusIcon'
import RefreshIcon from './icons/RefreshIcon'
import TrashIcon from './icons/TrashIcon'

type Props = {
  channels: Channel[]
  refreshing: Set<string>
  errors: Map<string, string>
  isRefreshingAll: boolean
  onRefresh: (id: string) => void
  onDelete: (id: string) => void
  onAdd: () => void
  onRefreshAll: () => void
}

/**
 * Channels no longer have a tile of their own to hang controls off, so their
 * per-channel actions live here, along with the dashboard-wide add/refresh.
 */
const ChannelsMenu = ({
  channels,
  refreshing,
  errors,
  isRefreshingAll,
  onRefresh,
  onDelete,
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
    <div className="channels-menu" ref={ref}>
      <button
        className={`topbar-btn${errors.size > 0 ? ' has-error' : ''}`}
        onClick={() => setOpen(!open)}
      >
        {channels.length} channel{channels.length === 1 ? '' : 's'}
        <ChevronDownIcon />
      </button>

      {open && (
        <div className="channels-dropdown">
          {channels.length === 0 && (
            <div className="channels-empty">No channels yet</div>
          )}
          {channels.map((channel) => (
            <div key={channel.id} className="channels-item">
              <span className="channels-item-name" title={channel.url}>
                {channel.id}
                <span className="channels-item-kind">{channel.kind}</span>
              </span>
              {errors.get(channel.id) && (
                <span
                  className="channels-item-error"
                  title={errors.get(channel.id)}
                >
                  failed
                </span>
              )}
              <div className="channels-item-actions">
                <button
                  className={`channels-action${
                    refreshing.has(channel.id) ? ' is-refreshing' : ''
                  }`}
                  title="Refresh"
                  disabled={refreshing.has(channel.id)}
                  onClick={() => onRefresh(channel.id)}
                >
                  <RefreshIcon />
                </button>
                <button
                  className="channels-action channels-action--danger"
                  title="Delete"
                  onClick={() => onDelete(channel.id)}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}

          <div className="channels-divider" />

          <button
            className="channels-menu-btn"
            onClick={() => {
              setOpen(false)
              onAdd()
            }}
          >
            <PlusIcon />
            Add channel
          </button>
          <button
            className={`channels-menu-btn${
              isRefreshingAll ? ' is-refreshing' : ''
            }`}
            disabled={isRefreshingAll || channels.length === 0}
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

export default ChannelsMenu
