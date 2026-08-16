import { useState } from 'react'
import api, { type Prediction } from './api'
import PredictionRow from './ui/predictions/PredictionRow'

type Props = {
  dashboardId: string
  /** The arc these predictions belong to, by slug. */
  storyline: string
  predictions: Prediction[]
  /** Called after any change, so the page reloads what it holds. */
  onChanged: () => void
}

/**
 * What this storyline points to and has not settled. The claims are the
 * reader's; the odds on them are the analyst's, and it moves them as the
 * coverage does — every move kept with its reasoning, one toggle away.
 */
const StorylinePredictions = ({
  dashboardId,
  storyline,
  predictions,
  onChanged,
}: Props) => {
  const [adding, setAdding] = useState(false)
  const [content, setContent] = useState('')
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
    await guard(() => api.createPrediction(dashboardId, storyline, trimmed))
    setContent('')
    setAdding(false)
  }

  const save = (id: number, next: string) =>
    guard(() => api.updatePrediction(dashboardId, id, next))

  const remove = (id: number) =>
    guard(() => api.deletePrediction(dashboardId, id))

  return (
    <div className="predictions">
      <header className="facts-head">
        <h2 className="facts-heading">
          Predictions
          {predictions.length > 0 && (
            <span className="facts-count">{predictions.length}</span>
          )}
        </h2>
        <button
          className="facts-add"
          onClick={() => setAdding((was) => !was)}
          title="Make a prediction"
        >
          {adding ? '×' : '+'}
        </button>
      </header>

      <div className="facts-body">
        {adding && (
          <div className="prediction is-editing">
            <textarea
              className="prediction-input"
              rows={3}
              autoFocus
              placeholder="What might happen? The analyst puts the odds on it."
              value={content}
              disabled={busy}
              onChange={(e) => setContent(e.target.value)}
            />
            <div className="prediction-actions">
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

        {predictions.length === 0 && !adding ? (
          <p className="facts-placeholder">
            Nothing predicted yet. Write what this storyline might lead to and
            the analyst will put a probability on it, and keep moving it as the
            coverage changes.
          </p>
        ) : (
          <ul className="predictions-list">
            {predictions.map((prediction) => (
              <PredictionRow
                key={prediction.id}
                prediction={prediction}
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

export default StorylinePredictions
