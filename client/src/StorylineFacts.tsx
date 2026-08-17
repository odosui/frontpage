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

type Props = {
  dashboardId: string
  /** The arc these facts belong to, by slug. */
  storyline: string
  facts: Fact[]
  /** Which revision `facts` is; 0 when nothing has been written down yet. */
  version: number
  /** Called after any change, so the page reloads what it holds. */
  onChanged: () => void
}

/**
 * What this storyline is taken to have established, newest first — the standing
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
const StorylineFacts = ({
  dashboardId,
  storyline,
  facts,
  version,
  onChanged,
}: Props) => {
  const [adding, setAdding] = useState(false)
  const [content, setContent] = useState('')
  const [confidence, setConfidence] = useState(DEFAULT_CONFIDENCE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showHistory, setShowHistory] = useState(false)
  const [versions, setVersions] = useState<FactsVersion[]>([])
  // which version is on screen; the current one unless the reader picked back
  const [viewing, setViewing] = useState(version)

  const loadHistory = useCallback(() => {
    return api
      .factsHistory(dashboardId, storyline)
      .then((data: { versions: FactsVersion[] }) =>
        setVersions(data.versions ?? []),
      )
      .catch((err: Error) => setError(err.message))
  }, [dashboardId, storyline])

  // a revision — this pane's or the analyst's — lands as a new version prop,
  // which drops any older one being read and refreshes the list behind it
  useEffect(() => {
    setViewing(version)
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
      api.createFact(dashboardId, storyline, {
        content: trimmed,
        confidence,
      }),
    )
    setContent('')
    setConfidence(DEFAULT_CONFIDENCE)
    setAdding(false)
  }

  const save = (id: string, patch: FactPatch) =>
    guard(() => api.updateFact(dashboardId, storyline, id, patch))

  const remove = (id: string) =>
    guard(() => api.deleteFact(dashboardId, storyline, id))

  // reading an older version is reading, not editing: what is shown is that
  // version's list, and the pane's write actions step out of the way
  const past = viewing !== version
  const shown = past
    ? (versions.find((entry) => entry.version === viewing)?.facts ?? [])
    : facts

  return (
    <div className="facts">
      <header className="facts-head">
        <h2 className="facts-heading">
          Facts
          {version > 0 && <span className="facts-count">v{viewing}</span>}
          {shown.length > 0 && (
            <span className="facts-count">{shown.length}</span>
          )}
        </h2>
        <div className="facts-tools">
          <button
            className={`facts-add${showHistory ? ' is-on' : ''}`}
            onClick={() => {
              const next = !showHistory
              setShowHistory(next)
              if (next) loadHistory()
              else setViewing(version)
            }}
            aria-expanded={showHistory}
            title="How this list got here"
          >
            ⟲
          </button>
          {!past && (
            <button
              className="facts-add"
              onClick={() => setAdding((was) => !was)}
              title="Write down a fact"
            >
              {adding ? '×' : '+'}
            </button>
          )}
        </div>
      </header>

      <div className="facts-body">
        {showHistory && (
          <div className="facts-history">
            <FactsHistory
              versions={versions}
              selected={viewing}
              onSelect={setViewing}
            />
          </div>
        )}

        {past && (
          <p className="facts-past">
            Version {viewing} of {versions.length}, as it stood then.{' '}
            <button className="fact-btn" onClick={() => setViewing(version)}>
              Back to current
            </button>
          </p>
        )}

        {adding && !past && (
          <div className="fact is-editing">
            <MarkdownTextarea
              className="fact-input"
              autoFocus
              placeholder="What does this storyline establish?"
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

        {shown.length === 0 && !adding ? (
          <p className="facts-placeholder">
            Nothing established yet. What holds true across this storyline —
            written by you or by the analyst — lives here, and is what the
            analyst reasons from.
          </p>
        ) : (
          <ul className="facts-list">
            {shown.map((fact) => (
              <FactRow
                key={fact.id}
                fact={fact}
                readOnly={past}
                onSave={save}
                onDelete={remove}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default StorylineFacts
