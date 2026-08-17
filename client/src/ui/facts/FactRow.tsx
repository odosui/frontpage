import { useState } from 'react'
import {
  CONFIDENCE_LABELS,
  type Fact,
  type FactPatch,
} from '../../api'
import InlineBold from '../InlineBold'
import { formatWhen, timeAgo } from '../../utils/dates'
import MarkdownTextarea from '../MarkdownTextarea'
import EditIcon from '../../icons/EditIcon'
import ExternalLinkIcon from '../../icons/ExternalLinkIcon'
import ConfidencePicker from './ConfidencePicker'

type Props = {
  fact: Fact
  /** An older version on screen: it can be read, but not written back to. */
  readOnly?: boolean
  onSave: (id: string, patch: FactPatch) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

/**
 * One fact: its confidence, the line itself, and where it came from. Reading is
 * the common case, so editing is a mode you enter rather than a form standing
 * open beside every row.
 */
const FactRow = ({ fact, readOnly = false, onSave, onDelete }: Props) => {
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(fact.content)
  const [confidence, setConfidence] = useState(fact.confidence)
  const [busy, setBusy] = useState(false)

  const start = () => {
    setContent(fact.content)
    setConfidence(fact.confidence)
    setEditing(true)
  }

  const save = async () => {
    const trimmed = content.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      await onSave(fact.id, { content: trimmed, confidence })
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!window.confirm(`Delete this fact?\n\n${fact.content}`)) return
    setBusy(true)
    try {
      await onDelete(fact.id)
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <li className="fact is-editing">
        <MarkdownTextarea
          className="fact-input"
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
            onClick={save}
          >
            Save
          </button>
          <button
            className="fact-btn"
            disabled={busy}
            onClick={() => setEditing(false)}
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
    <li className="fact">
      {/* plain text: reading a fact is not a click, and selecting a line of it
          should not put the row into edit mode. The `**` markers are rendered,
          not shown — editing still sees the raw line */}
      <p className="fact-content">
        <InlineBold text={fact.content} />
      </p>

      <div className="fact-meta">
        <span
          className={`fact-confidence is-${fact.confidence}`}
          title={`${fact.confidence}/5 — ${CONFIDENCE_LABELS[fact.confidence]}`}
        >
          {fact.confidence}
        </span>

        {/* the source is an icon: its headline is worth having on hover, not
            worth a line of its own beneath every fact */}
        {fact.articleUrl && (
          <a
            className="fact-icon"
            href={fact.articleUrl}
            target="_blank"
            rel="noreferrer"
            title={fact.articleTitle ?? 'Open the source article'}
            aria-label={fact.articleTitle ?? 'Open the source article'}
          >
            <ExternalLinkIcon />
          </a>
        )}

        {!readOnly && (
          <button
            className="fact-icon"
            onClick={start}
            title="Edit this fact"
            aria-label={`Edit: ${fact.content}`}
          >
            <EditIcon />
          </button>
        )}

        {/* when it was written down, which is not the same as when the thing
            happened — that belongs in the line itself. The list runs newest
            first, so this is what says where the new ones stop */}
        <time
          className="fact-when"
          dateTime={fact.createdAt}
          title={`Written down ${formatWhen(fact.createdAt)}`}
        >
          {timeAgo(fact.createdAt)}
        </time>
      </div>
    </li>
  )
}

export default FactRow
