import { useState } from 'react'
import { LIKELIHOOD_LABELS, type Prediction } from '../../api'
import InlineBold from '../InlineBold'
import MarkdownTextarea from '../MarkdownTextarea'
import { formatWhen, timeAgo } from '../../utils/dates'

type Props = {
  prediction: Prediction
  onSave: (id: number, content: string) => Promise<void>
  onDelete: (id: number) => Promise<void>
}

/**
 * A claim, where the odds stand, and — when opened — every move they have made
 * with the reasoning behind it. The history is folded away because the current
 * number is what a reader wants nine times out of ten; the tenth time, it is
 * the only thing that matters.
 */
const PredictionRow = ({ prediction, onSave, onDelete }: Props) => {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(prediction.content)
  const [busy, setBusy] = useState(false)

  const history = prediction.forecasts
  const latest = history[0]

  const save = async () => {
    const trimmed = content.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      await onSave(prediction.id, trimmed)
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!window.confirm(`Delete this prediction?\n\n${prediction.content}`)) {
      return
    }
    setBusy(true)
    try {
      await onDelete(prediction.id)
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <li className="prediction is-editing">
        <MarkdownTextarea
          className="prediction-input"
          value={content}
          disabled={busy}
          onChange={setContent}
        />
        <div className="prediction-actions">
          <button
            className="fact-btn fact-btn--primary"
            disabled={busy || content.trim() === ''}
            onClick={save}
          >
            Save
          </button>
          <button
            className="fact-btn"
            disabled={busy}
            onClick={() => {
              setContent(prediction.content)
              setEditing(false)
            }}
          >
            Cancel
          </button>
          <button
            className="fact-btn fact-btn--danger"
            disabled={busy}
            onClick={remove}
          >
            Delete
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className="prediction">
      <button
        className="prediction-body"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        title={history.length > 0 ? 'Show how this moved' : 'Not forecast yet'}
      >
        <span
          className={`prediction-odds${band(prediction.likelihood)}`}
          title={
            prediction.likelihood === null
              ? 'Not forecast yet'
              : LIKELIHOOD_LABELS[prediction.likelihood]
          }
        >
          {prediction.likelihood === null ? '—' : `${prediction.likelihood}/5`}
        </span>
        <span className="prediction-content">
          <InlineBold text={prediction.content} />
        </span>
      </button>

      {open && (
        <div className="prediction-history">
          {history.length === 0 ? (
            <p className="prediction-empty">
              No forecast yet — the analyst puts the odds on it.
            </p>
          ) : (
            <ol className="prediction-moves">
              {history.map((move) => (
                <li key={move.id} className="prediction-move">
                  <div className="prediction-move-head">
                    <span className="prediction-move-odds">
                      {move.previous === null
                        ? `set to ${LIKELIHOOD_LABELS[move.likelihood]}`
                        : `${LIKELIHOOD_LABELS[move.previous]} → ${
                            LIKELIHOOD_LABELS[move.likelihood]
                          }`}
                    </span>
                    <time
                      className="prediction-move-when"
                      dateTime={move.createdAt}
                      title={formatWhen(move.createdAt)}
                    >
                      {timeAgo(move.createdAt)}
                    </time>
                  </div>
                  <p className="prediction-move-why">
                    <InlineBold text={move.reasoning} />
                  </p>
                </li>
              ))}
            </ol>
          )}

          <div className="prediction-actions">
            <button className="fact-btn" onClick={() => setEditing(true)}>
              Edit
            </button>
            {latest && (
              <span className="prediction-move-when">
                {history.length} {history.length === 1 ? 'move' : 'moves'}
              </span>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

/** Long odds read differently from even ones, so the rung carries its own key. */
function band(likelihood: number | null): string {
  return likelihood === null ? ' is-none' : ` is-${likelihood}`
}

export default PredictionRow
