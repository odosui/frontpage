import { useCallback, useEffect, useRef, useState } from 'react'
import api, { type CatalogModel, type ModelSetting } from './api'

/**
 * Which models the instance runs on.
 *
 * Both slots used to be constants in the server's source. They are picked here
 * now, but only ever out of OpenRouter's own catalogue: the field cannot be
 * committed by typing, only by choosing a row, so an id that does not exist
 * never reaches the database. The server checks again on the way in — the
 * failure this guards against (every job on the instance failing at once, long
 * after whoever typed it has closed the page) is too quiet to leave to the ui.
 */
const ModelsSettings = () => {
  const [slots, setSlots] = useState<ModelSetting[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .getSettings()
      .then((data: { models: ModelSetting[] }) => {
        setSlots(data.models)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [])

  useEffect(load, [load])

  const save = (key: string, value: string) => {
    setSaving(key)
    api
      .setModel(key, value)
      .then((data: { models: ModelSetting[] }) => {
        setSlots(data.models)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setSaving(null))
  }

  if (!slots) {
    return <p className="settings-muted">{error || 'Loading…'}</p>
  }

  return (
    <>
      {error && <p className="settings-error">{error}</p>}
      <div className="models-list">
        {slots.map((slot) => (
          <ModelSlot
            key={slot.key}
            slot={slot}
            busy={saving === slot.key}
            onPick={(id) => save(slot.key, id)}
            onReset={() => save(slot.key, '')}
          />
        ))}
      </div>
    </>
  )
}

const ModelSlot: React.FC<{
  slot: ModelSetting
  busy: boolean
  onPick: (id: string) => void
  onReset: () => void
}> = ({ slot, busy, onPick, onReset }) => (
  <div className="model-slot">
    <div className="model-slot-head">
      <span className="model-slot-label">{slot.label}</span>
      {slot.isSet ? (
        <button className="model-slot-reset" onClick={onReset} disabled={busy}>
          Reset to default
        </button>
      ) : (
        <span className="settings-muted model-slot-source">
          {slot.envValue ? `from ${slot.envVar}` : 'default'}
        </span>
      )}
    </div>
    <p className="model-slot-description">{slot.description}</p>
    <ModelPicker value={slot.value} busy={busy} onPick={onPick} />
    {/* The env var still names a model; it is just no longer the one running,
        and someone reading the deploy config deserves to be told that here. */}
    {slot.isSet && slot.envValue && slot.envValue !== slot.value && (
      <p className="settings-muted model-slot-note">
        Overrides {slot.envVar}={slot.envValue}
      </p>
    )}
  </div>
)

/** How long to sit on a keystroke before asking OpenRouter about it. */
const DEBOUNCE_MS = 180

const ModelPicker: React.FC<{
  value: string
  busy: boolean
  onPick: (id: string) => void
}> = ({ value, busy, onPick }) => {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(value)
  const [results, setResults] = useState<CatalogModel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)

  // the saved value moving under us (a reset, another tab) wins over a draft
  useEffect(() => setText(value), [value])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(() => {
      api
        .searchModels(text)
        .then((data: { models: CatalogModel[] }) => {
          if (cancelled) return
          setResults(data.models)
          setActive(0)
          setError(null)
        })
        .catch((err: Error) => !cancelled && setError(err.message))
        .finally(() => !cancelled && setLoading(false))
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [text, open])

  // clicking away is a cancel, not a commit: the draft goes back to what is
  // actually saved rather than sitting there looking like it took
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  })

  const close = () => {
    setOpen(false)
    setText(value)
  }

  const pick = (model: CatalogModel) => {
    setOpen(false)
    setText(model.id)
    if (model.id !== value) onPick(model.id)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return close()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      // Enter takes the highlighted row and nothing else. Typed text is never
      // a model until the catalogue says it is one.
      const model = results[active]
      if (model) pick(model)
    }
  }

  return (
    <div className="model-picker" ref={box}>
      <input
        className="form-input model-picker-input"
        value={text}
        disabled={busy}
        spellCheck={false}
        role="combobox"
        aria-expanded={open}
        placeholder="Search OpenRouter models…"
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {open && (
        <ul className="model-options" role="listbox">
          {error && <li className="model-option-empty is-error">{error}</li>}
          {!error && results.length === 0 && (
            <li className="model-option-empty">
              {loading ? 'Searching…' : `No model matches “${text}”`}
            </li>
          )}
          {results.map((model, i) => (
            <li key={model.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={`model-option${i === active ? ' is-active' : ''}${
                  model.id === value ? ' is-current' : ''
                }`}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(model)}
              >
                <span className="model-option-name">{model.name}</span>
                <span className="model-option-id">{model.id}</span>
                <span className="model-option-meta">{meta(model)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Context window and price — what the choice between two models turns on. */
function meta(model: CatalogModel): string {
  const parts: string[] = []
  if (model.contextLength) parts.push(`${tokens(model.contextLength)} ctx`)
  if (model.promptPrice !== null) parts.push(`${perMillion(model.promptPrice)} in`)
  if (model.completionPrice !== null) {
    parts.push(`${perMillion(model.completionPrice)} out`)
  }
  return parts.join(' · ')
}

function tokens(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

/** Per-token prices are unreadable; per million is how they are quoted. */
function perMillion(price: number): string {
  if (price === 0) return 'free'
  return `$${(price * 1_000_000).toFixed(2)}/M`
}

export default ModelsSettings
