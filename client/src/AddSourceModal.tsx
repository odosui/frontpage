import * as React from 'react'
import { useEffect, useState } from 'react'
import GenericModal from './ui/GenericModal'
import api, {
  DEFAULT_MIN_SCORE,
  SOURCE_KINDS,
  type NewSource,
  type Source,
  type SourceKind,
} from './api'

/** Kinds the backend can actually fetch today; the rest are listed as coming. */
const IMPLEMENTED: SourceKind[] = ['web', 'rss', 'reddit']

type Props = {
  isOpen: boolean
  /** What this dashboard already reads, so it is not offered twice. */
  assigned: Source[]
  onClose: () => void
  onAdd: (source: NewSource | { sourceId: string }) => Promise<unknown>
}

/**
 * Two ways to point an arc at a source, because there are two situations.
 *
 * Sources are independent of dashboards now, so most of the time the outlet
 * you want is already in the system — another arc reads it, and pointing this
 * one at it costs nothing extra, not even a second fetch. Making a new one is
 * the other case, and it is the second tab rather than the first for exactly
 * that reason.
 */
const AddSourceModal: React.FC<Props> = ({
  isOpen,
  assigned,
  onClose,
  onAdd,
}) => {
  const [tab, setTab] = useState<'existing' | 'new'>('existing')
  const [all, setAll] = useState<Source[]>([])
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState<SourceKind>('web')
  const [minScore, setMinScore] = useState(String(DEFAULT_MIN_SCORE))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setError(null)
    api
      .listSources()
      .then((data: { sources: Source[] }) => {
        const sources = data.sources || []
        setAll(sources)
        // nothing to pick from is not a choice; open straight on the form
        const taken = new Set(assigned.map((s) => s.id))
        if (sources.every((s) => taken.has(s.id))) setTab('new')
      })
      .catch((err: Error) => setError(err.message))
    // `assigned` is a fresh array each render; its contents change with the
    // reload that follows any assignment, which reopens this anyway
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const close = () => {
    setName('')
    setUrl('')
    setKind('web')
    setMinScore(String(DEFAULT_MIN_SCORE))
    setError(null)
    setTab('existing')
    onClose()
  }

  const submit = async (source: NewSource | { sourceId: string }) => {
    setError(null)
    setBusy(true)
    try {
      await onAdd(source)
      close()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const create = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !url.trim()) return
    submit({
      name: name.trim(),
      kind,
      url: url.trim(),
      ...(kind === 'reddit'
        ? { config: { minScore: Number(minScore) || 0 } }
        : {}),
    })
  }

  const taken = new Set(assigned.map((s) => s.id))
  const available = all.filter((s) => !taken.has(s.id))

  return (
    <GenericModal isOpen={isOpen} onClose={close} contentLabel="Add a source">
      <h2 className="modal-title">Add a source</h2>

      <div className="modal-tabs">
        <button
          className={`modal-tab${tab === 'existing' ? ' is-active' : ''}`}
          onClick={() => setTab('existing')}
        >
          Existing
          {available.length > 0 && (
            <span className="modal-tab-count">{available.length}</span>
          )}
        </button>
        <button
          className={`modal-tab${tab === 'new' ? ' is-active' : ''}`}
          onClick={() => setTab('new')}
        >
          New
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      {tab === 'existing' ? (
        available.length === 0 ? (
          <p className="form-hint">
            This dashboard already reads every source there is. Make a new one.
          </p>
        ) : (
          <ul className="source-picker">
            {available.map((source) => (
              <li key={source.id}>
                <button
                  className="source-picker-item"
                  disabled={busy}
                  onClick={() => submit({ sourceId: source.id })}
                >
                  <span className="source-picker-name">
                    {source.name}
                    <span className="source-picker-kind">{source.kind}</span>
                  </span>
                  <span className="source-picker-meta" title={source.url}>
                    {source.articleCount} articles ·{' '}
                    {source.dashboardCount === 0
                      ? 'unread'
                      : `read by ${source.dashboardCount}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <form className="add-source-form" onSubmit={create}>
          <label className="form-field">
            <span className="form-label">Name</span>
            <input
              className="form-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Reuters world"
              autoFocus
            />
          </label>
          <label className="form-field">
            <span className="form-label">Kind</span>
            <select
              className="form-input"
              value={kind}
              onChange={(e) => setKind(e.target.value as SourceKind)}
            >
              {SOURCE_KINDS.map((k) => (
                <option key={k} value={k} disabled={!IMPLEMENTED.includes(k)}>
                  {IMPLEMENTED.includes(k) ? k : `${k} (not yet)`}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">
              {kind === 'reddit' ? 'Subreddit' : 'URL'}
            </span>
            <input
              className="form-input"
              // a subreddit may be typed bare, so it is not a url field
              type={kind === 'reddit' ? 'text' : 'url'}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={
                kind === 'reddit' ? 'r/futurology' : 'https://example.com/feed'
              }
            />
          </label>

          {/* the bar is per subreddit: what is busy on one is dead on another */}
          {kind === 'reddit' && (
            <label className="form-field">
              <span className="form-label">Minimum points</span>
              <input
                className="form-input"
                type="number"
                min={0}
                value={minScore}
                onChange={(e) => setMinScore(e.target.value)}
              />
              <span className="form-hint form-hint--field">
                Posts below this are ignored. A post that climbs past it later
                is picked up on a following refresh.
              </span>
            </label>
          )}

          <p className="form-hint">
            {kind === 'reddit'
              ? 'Link posts are stored as the article they point at, so the ' +
                'outlet is what shows in the feed, with the thread one click away.'
              : 'The source is created once and can be read by any dashboard, ' +
                'so name it after the outlet rather than after this arc.'}
          </p>
          <div className="form-actions">
            <button type="button" className="btn btn--secondary" onClick={close}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={busy || !name.trim() || !url.trim()}
            >
              Add
            </button>
          </div>
        </form>
      )}
    </GenericModal>
  )
}

export default React.memo(AddSourceModal)
