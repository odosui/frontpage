import { useState } from 'react'
import api, {
  DEFAULT_CONFIDENCE,
  type Fact,
  type FactPatch,
} from './api'
import ConfidencePicker from './ui/facts/ConfidencePicker'
import FactRow from './ui/facts/FactRow'

type Props = {
  dashboardId: string
  /** The arc these facts belong to, by slug. */
  storyline: string
  facts: Fact[]
  /** Called after any change, so the page reloads what it holds. */
  onChanged: () => void
}

/**
 * What this storyline is taken to have established, surest first — the standing
 * knowledge the coverage is read against, rather than a summary of it.
 *
 * The same list the analyst is given at the top of every conversation, so what
 * is written here is what it reasons from.
 */
const StorylineFacts = ({
  dashboardId,
  storyline,
  facts,
  onChanged,
}: Props) => {
  const [adding, setAdding] = useState(false)
  const [content, setContent] = useState('')
  const [confidence, setConfidence] = useState(DEFAULT_CONFIDENCE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const save = (id: number, patch: FactPatch) =>
    guard(() => api.updateFact(dashboardId, id, patch))

  const remove = (id: number) => guard(() => api.deleteFact(dashboardId, id))

  return (
    <div className="facts">
      <header className="facts-head">
        <h2 className="facts-heading">
          Facts
          {facts.length > 0 && (
            <span className="facts-count">{facts.length}</span>
          )}
        </h2>
        <button
          className="facts-add"
          onClick={() => setAdding((was) => !was)}
          title="Write down a fact"
        >
          {adding ? '×' : '+'}
        </button>
      </header>

      <div className="facts-body">
        {adding && (
          <div className="fact is-editing">
            <textarea
              className="fact-input"
              rows={3}
              autoFocus
              placeholder="What does this storyline establish?"
              value={content}
              disabled={busy}
              onChange={(e) => setContent(e.target.value)}
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
            Nothing established yet. What holds true across this storyline —
            written by you or by the analyst — lives here, and is what the
            analyst reasons from.
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
    </div>
  )
}

export default StorylineFacts
