import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

type Props = {
  disabled?: boolean
  /** Set while the composer is on screen: it takes the cursor when it appears. */
  focused?: boolean
  placeholder?: string
  onSend: (message: string) => void
}

/**
 * The box you type in. Enter sends, shift-enter breaks the line — the question
 * is usually one line, but a pasted quote shouldn't be sent halfway through.
 */
const ChatComposer = ({
  disabled = false,
  focused = false,
  placeholder,
  onSend,
}: Props) => {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const widthRef = useRef(0)

  const resize = useCallback(() => {
    const input = inputRef.current
    if (!input) return
    input.style.height = 'auto'
    const maxHeight = 160
    // box-sizing is border-box, but scrollHeight excludes the border
    const borders = input.offsetHeight - input.clientHeight
    const wanted = Math.min(input.scrollHeight + borders, maxHeight)
    input.style.height = `${wanted}px`
    input.style.overflowY =
      input.scrollHeight + borders > maxHeight ? 'auto' : 'hidden'
  }, [])

  useLayoutEffect(resize, [resize, value])

  // the panel mounts hidden, where every measurement is 0 — remeasure once it
  // is actually laid out, and again whenever the composer changes width
  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    const observer = new ResizeObserver(() => {
      const width = input.clientWidth
      if (width === widthRef.current) return
      widthRef.current = width
      resize()
    })
    observer.observe(input)
    return () => observer.disconnect()
  }, [resize])

  useEffect(() => {
    if (focused) inputRef.current?.focus()
  }, [focused])

  const send = () => {
    const message = value.trim()
    if (!message || disabled) return
    onSend(message)
    setValue('')
  }

  return (
    <form
      className="chat-composer"
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
    >
      <textarea
        ref={inputRef}
        className="chat-input"
        rows={2}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send()
          }
        }}
      />
      <button
        className="chat-send"
        type="submit"
        disabled={disabled || value.trim() === ''}
      >
        Ask
      </button>
    </form>
  )
}

export default ChatComposer
