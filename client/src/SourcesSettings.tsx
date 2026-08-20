import { useCallback, useEffect, useState } from 'react'
import api, {
  DEFAULT_MIN_SCORE,
  SOURCE_KINDS,
  type Source,
  type SourceKind,
} from './api'
import RefreshIcon from './icons/RefreshIcon'
import TrashIcon from './icons/TrashIcon'

/** Kinds the backend can actually fetch today. */
const IMPLEMENTED: SourceKind[] = ['web', 'rss', 'reddit']

/**
 * Every source there is, whoever reads it.
 *
 * A dashboard's own menu only assigns and unassigns — from inside an arc,
 * "remove" means "stop reading this here", and it must not reach into other
 * arcs. This is the one place a source is edited or actually destroyed, which
 * is why the delete here says what it takes with it.
 */
const SourcesSettings = () => {
  const [sources, setSources] = useState<Source[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<{
    url: string
    kind: SourceKind
    minScore: string
  }>({ url: '', kind: 'web', minScore: String(DEFAULT_MIN_SCORE) })
  const [creating, setCreating] = useState(false)
  const [made, setMade] = useState({
    name: '',
    url: '',
    kind: 'web' as SourceKind,
    minScore: String(DEFAULT_MIN_SCORE),
  })

  const load = useCallback(() => {
    api
      .listSources()
      .then((data: { sources: Source[] }) => {
        setSources(data.sources || [])
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [])

  useEffect(load, [load])

  const guard = (work: Promise<unknown>) =>
    work
      .then(() => {
        setError(null)
        load()
      })
      .catch((err: Error) => setError(err.message))

  const save = (id: string) => {
    setEditing(null)
    guard(
      api.updateSource(id, {
        url: draft.url.trim(),
        kind: draft.kind,
        ...(draft.kind === 'reddit'
          ? { config: { minScore: Number(draft.minScore) || 0 } }
          : {}),
      }),
    )
  }

  const remove = (source: Source) => {
    const warning =
      source.dashboardCount > 0
        ? `"${source.name}" is read by ${source.dashboardCount} dashboard${
            source.dashboardCount > 1 ? 's' : ''
          }. Deleting it removes its ${source.articleCount} articles from all of them.`
        : `Delete "${source.name}" and its ${source.articleCount} articles?`
    if (!window.confirm(warning)) return
    guard(api.deleteSource(source.id))
  }

  const create = () => {
    const name = made.name.trim()
    const url = made.url.trim()
    if (!name || !url) return
    setCreating(false)
    setMade({
      name: '',
      url: '',
      kind: 'web',
      minScore: String(DEFAULT_MIN_SCORE),
    })
    guard(
      api.createSource({
        name,
        url,
        kind: made.kind,
        ...(made.kind === 'reddit'
          ? { config: { minScore: Number(made.minScore) || 0 } }
          : {}),
      }),
    )
  }

  return (
    <>
      {error && <p className="settings-error">{error}</p>}

      <table className="settings-table sources-table">
        <thead>
          <tr>
            <th>Source</th>
            <th>URL</th>
            <th className="num">Articles</th>
            <th className="num">Dashboards</th>
            <th className="num">Last fetch</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sources.length === 0 && (
            <tr>
              <td colSpan={6} className="settings-muted">
                No sources yet.
              </td>
            </tr>
          )}
          {sources.map((source) => (
            <tr key={source.id}>
              <td>
                {source.name}
                <span className="sources-item-kind">{source.kind}</span>
              </td>
              <td className="sources-table-url">
                {editing === source.id ? (
                  <div className="sources-edit">
                    <select
                      className="form-input"
                      value={draft.kind}
                      onChange={(e) =>
                        setDraft({ ...draft, kind: e.target.value as SourceKind })
                      }
                    >
                      {SOURCE_KINDS.map((k) => (
                        <option
                          key={k}
                          value={k}
                          disabled={!IMPLEMENTED.includes(k)}
                        >
                          {k}
                        </option>
                      ))}
                    </select>
                    <input
                      className="form-input"
                      value={draft.url}
                      autoFocus
                      onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') save(source.id)
                        if (e.key === 'Escape') setEditing(null)
                      }}
                    />
                    {/* the bar is this subreddit's own: busy on one sub is
                        dead on another */}
                    {draft.kind === 'reddit' && (
                      <input
                        className="form-input sources-score"
                        type="number"
                        min={0}
                        title="Minimum points"
                        value={draft.minScore}
                        onChange={(e) =>
                          setDraft({ ...draft, minScore: e.target.value })
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') save(source.id)
                          if (e.key === 'Escape') setEditing(null)
                        }}
                      />
                    )}
                    <button className="btn btn--primary" onClick={() => save(source.id)}>
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    className="sources-table-edit"
                    title="Edit"
                    onClick={() => {
                      setEditing(source.id)
                      setDraft({
                        url: source.url,
                        kind: source.kind,
                        minScore: String(
                          source.config.minScore ?? DEFAULT_MIN_SCORE,
                        ),
                      })
                    }}
                  >
                    {source.url}
                    {source.kind === 'reddit' && (
                      <span className="sources-item-kind">
                        {source.config.minScore ?? DEFAULT_MIN_SCORE}+ points
                      </span>
                    )}
                  </button>
                )}
              </td>
              <td className="num">{source.articleCount}</td>
              <td
                className={`num${source.dashboardCount === 0 ? ' is-orphan' : ''}`}
                title={
                  source.dashboardCount === 0
                    ? 'No dashboard reads this source'
                    : undefined
                }
              >
                {source.dashboardCount}
              </td>
              <td className="num">
                {source.fetchedAt ? ago(source.fetchedAt) : 'never'}
              </td>
              <td className="sources-table-actions">
                <button
                  className="sources-action"
                  title="Refresh now"
                  onClick={() => guard(api.refreshSource(source.id))}
                >
                  <RefreshIcon />
                </button>
                <button
                  className="sources-action sources-action--danger"
                  title="Delete everywhere"
                  onClick={() => remove(source)}
                >
                  <TrashIcon />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {creating ? (
        <div className="sources-create">
          <input
            className="form-input"
            placeholder="Name"
            value={made.name}
            autoFocus
            onChange={(e) => setMade({ ...made, name: e.target.value })}
          />
          <select
            className="form-input"
            value={made.kind}
            onChange={(e) =>
              setMade({ ...made, kind: e.target.value as SourceKind })
            }
          >
            {SOURCE_KINDS.map((k) => (
              <option key={k} value={k} disabled={!IMPLEMENTED.includes(k)}>
                {k}
              </option>
            ))}
          </select>
          <input
            className="form-input"
            placeholder={
              made.kind === 'reddit' ? 'r/futurology' : 'https://example.com/feed'
            }
            value={made.url}
            onChange={(e) => setMade({ ...made, url: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create()
              if (e.key === 'Escape') setCreating(false)
            }}
          />
          {made.kind === 'reddit' && (
            <input
              className="form-input sources-score"
              type="number"
              min={0}
              title="Minimum points"
              value={made.minScore}
              onChange={(e) => setMade({ ...made, minScore: e.target.value })}
            />
          )}
          <button
            className="btn btn--primary"
            disabled={!made.name.trim() || !made.url.trim()}
            onClick={create}
          >
            Add
          </button>
          <button className="btn btn--secondary" onClick={() => setCreating(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="settings-reload" onClick={() => setCreating(true)}>
          Add a source
        </button>
      )}
    </>
  )
}

/** Rough age, good enough for a "last fetch" column. */
function ago(iso: string): string {
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (seconds < 90) return 'just now'
  const minutes = seconds / 60
  if (minutes < 90) return `${Math.round(minutes)}m ago`
  const hours = minutes / 60
  if (hours < 36) return `${Math.round(hours)}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export default SourcesSettings
