import { CONFIDENCE_LABELS, MAX_CONFIDENCE, MIN_CONFIDENCE } from '../../api'

type Props = {
  value: number
  onChange: (confidence: number) => void
  disabled?: boolean
}

/**
 * How far a fact can be trusted, as five rungs rather than a number field: the
 * scale is short and its ends mean something specific, so picking one should
 * cost a click and show what it will mean.
 */
const ConfidencePicker = ({ value, onChange, disabled = false }: Props) => {
  const rungs = []
  for (let n = MIN_CONFIDENCE; n <= MAX_CONFIDENCE; n++) rungs.push(n)

  return (
    <div className="confidence" role="group" aria-label="Confidence">
      {rungs.map((n) => (
        <button
          key={n}
          type="button"
          className={`confidence-rung${n <= value ? ' is-on' : ''}`}
          disabled={disabled}
          title={`${n}/5 — ${CONFIDENCE_LABELS[n]}`}
          aria-pressed={n === value}
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}
      <span className="confidence-label">{CONFIDENCE_LABELS[value]}</span>
    </div>
  )
}

export default ConfidencePicker
