import { useCallback, useEffect, useState } from 'react'
import api, {
  DEFAULT_CONFIDENCE,
  type Fact,
  type FactPatch,
  type FactsVersion,
} from './api'
import MarkdownTextarea from './ui/MarkdownTextarea'
import ConfidencePicker from './ui/facts/ConfidencePicker'
import FactRow from './ui/facts/FactRow'
import FactsHistory from './ui/facts/FactsHistory'
import FactsVersionModal from './ui/facts/FactsVersionModal'

type Props = {
  dashboardId: string
  facts: Fact[]
  /** Which revision `facts` is; 0 when nothing has been written down yet. */
  version: number
  /** Called after any change, so the page reloads what it holds. */
  onChanged: () => void
}

/**
 * What this dashboard is taken to have established, newest first — the standing
 * knowledge the coverage is read against, rather than a summary of it.
 *
 * The same list the analyst is given at the top of every conversation, so what
 * is written here is what it reasons from.
 *
 * Nothing here is edited in place. Adding, changing or dropping a fact writes
 * the whole set again as the next version, which is what makes the history
 * panel possible: what stood before is still there, next to the reason it
 * stopped standing.
 */
const Facts = ({ dashboardId, facts, version, onChanged }: Props) => {
  const [adding, setAdding] = useState(false)
  const [content, setContent] = useState('')
  const [confidence, setConfidence] = useState(DEFAULT_CONFIDENCE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showHistory, setShowHistory] = useState(false)
  const [versions, setVersions] = useState<FactsVersion[]>([])
  // the revision being read in full, if any
  const [reading, setReading] = useState<FactsVersion | null>(null)

  const loadHistory = useCallback(() => {
    return api
      .factsHistory(dashboardId)
      .then((data: { versions: FactsVersion[] }) =>
        setVersions(data.versions ?? []),
      )
      .catch((err: Error) => setError(err.message))
  }, [dashboardId])

  // a revision — this pane's or the analyst's — lands as a new version prop,
  // which refreshes the list behind it
  useEffect(() => {
    if (showHistory) loadHistory()
  }, [version, showHistory, loadHistory])

  const guard = async (work: () => Promise<unknown>) => {
    setError(null)
    setBusy(true)
    try {
      await work()
      onChanged()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const add = async () => {
    const trimmed = content.trim()
    if (!trimmed) return
    await guard(() =>
      api.createFact(dashboardId, { content: trimmed, confidence }),
    )
    setContent('')
    setConfidence(DEFAULT_CONFIDENCE)
    setAdding(false)
  }

  const save = (id: string, patch: FactPatch) =>
    guard(() => api.updateFact(dashboardId, id, patch))

  const remove = (id: string) => guard(() => api.deleteFact(dashboardId, id))

  return (
    <div className="facts">
      <header className="col-head">
        <h2 className="col-heading">
          Facts
          {version > 0 && <span className="col-count">v{version}</span>}
          {facts.length > 0 && (
            <span className="col-count">{facts.length}</span>
          )}
        </h2>
        <div className="col-tools">
          <button
            className={`col-btn${showHistory ? ' is-on' : ''}`}
            onClick={() => {
              const next = !showHistory
              setShowHistory(next)
              if (next) loadHistory()
            }}
            aria-expanded={showHistory}
            title="How this list got here"
          >
            ⟲
          </button>
          <button
            className="col-btn"
            onClick={() => setAdding((was) => !was)}
            title="Write down a fact"
          >
            {adding ? '×' : '+'}
          </button>
        </div>
      </header>

      <div className="col-body">
        {showHistory && (
          <div className="facts-history">
            <FactsHistory versions={versions} onOpen={setReading} />
          </div>
        )}

        {adding && (
          <div className="fact is-editing">
            <MarkdownTextarea
              className="fact-input"
              autoFocus
              placeholder="What does this dashboard establish?"
              value={content}
              disabled={busy}
              onChange={setContent}
            />
            <ConfidencePicker
              value={confidence}
              onChange={setConfidence}
              disabled={busy}
            />
            <div className="fact-actions">
              <button
                className="fact-btn fact-btn--primary"
                disabled={busy || content.trim() === ''}
                onClick={add}
              >
                Add
              </button>
              <button
                className="fact-btn"
                disabled={busy}
                onClick={() => setAdding(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && <p className="fact-error">{error}</p>}

        {facts.length === 0 && !adding ? (
          <p className="facts-placeholder">
            Nothing established yet. What holds true across this arc — written
            by you or by the analyst — lives here, and is what the analyst
            reasons from.
          </p>
        ) : (
          <ul className="facts-list">
            {facts.map((fact) => (
              <FactRow
                key={fact.id}
                fact={fact}
                onSave={save}
                onDelete={remove}
              />
            ))}
          </ul>
        )}
      </div>

      <FactsVersionModal
        version={reading}
        previous={
          reading
            ? (versions[versions.findIndex((v) => v.id === reading.id) + 1] ??
              null)
            : null
        }
        onClose={() => setReading(null)}
      />
    </div>
  )
}

export default Facts
