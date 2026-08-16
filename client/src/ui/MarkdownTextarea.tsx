import { useEffect, useRef, useState } from 'react'
import { toggleBold } from '../utils/toggleBold'

type Props = {
  value: string
  onChange: (value: string) => void
  rows?: number
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  className?: string
  /** Enter sends, where there is something for it to send to. */
  onSubmit?: () => void
}

/**
 * The box facts and predictions are written in. A plain textarea plus cmd-B
 * (ctrl-B elsewhere), which wraps the selection in `**` — the one piece of
 * markup this text uses, and the one the panes render.
 *
 * The caret has to be restored by hand: react rewrites the value on the next
 * render, and the browser would leave the cursor at the end of it.
 */
const MarkdownTextarea = ({
  value,
  onChange,
  rows = 3,
  placeholder,
  disabled = false,
  autoFocus = false,
  className = '',
  onSubmit,
}: Props) => {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [selection, setSelection] = useState<[number, number] | null>(null)

  useEffect(() => {
    if (!selection || !ref.current) return
    ref.current.setSelectionRange(selection[0], selection[1])
    setSelection(null)
  }, [selection, value])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault()
      const field = e.currentTarget
      const next = toggleBold({
        value: field.value,
        start: field.selectionStart,
        end: field.selectionEnd,
      })
      onChange(next.value)
      setSelection([next.start, next.end])
      return
    }

    if (onSubmit && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <textarea
      ref={ref}
      className={className}
      rows={rows}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      title="cmd-B wraps the selection in **bold**"
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
    />
  )
}

export default MarkdownTextarea
