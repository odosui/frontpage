import { useEffect, useState } from 'react'

type Props = {
  /** The instruction as the server last confirmed it. */
  value: string
  onSave: (prompt: string) => Promise<void>
}

/**
 * The arc's standing instruction to its agents: whatever this dashboard needs
 * said that the generic brief cannot know — which side calls itself what, which
 * outlet to discount, which thread of the story matters.
 *
 * It is saved on the dashboard rather than on a run, so it holds for every
 * agent started here and for every turn of the chat beside it.
 */
const DashboardPrompt: React.FC<Props> = ({ value, onSave }) => {
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // a change made in another tab, or the arc switching under the modal
  useEffect(() => setDraft(value), [value])

  const dirty = draft.trim() !== value.trim()

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(draft.trim())
    } catch {
      setError('could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="agents-prompt">
      <label className="agents-prompt-label" htmlFor="agents-prompt-input">
        Extra prompt
      </label>
      <p className="agents-prompt-hint">
        Appended to every agent run and chat turn on this dashboard.
      </p>
      <textarea
        id="agents-prompt-input"
        className="agents-prompt-input"
        rows={4}
        value={draft}
        placeholder="e.g. Treat ministry statements as claims, not facts."
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="agents-prompt-actions">
        {error && <span className="agents-error">{error}</span>}
        {!error && dirty && (
          <span className="agents-prompt-state">Unsaved</span>
        )}
        <button
          className="agents-prompt-save"
          disabled={!dirty || saving}
          onClick={save}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

export default DashboardPrompt
