import { useState } from 'react'

type Props = {
  disabled?: boolean
  placeholder?: string
  onSend: (message: string) => void
}

/**
 * The box you type in. Enter sends, shift-enter breaks the line — the question
 * is usually one line, but a pasted quote shouldn't be sent halfway through.
 */
const ChatComposer = ({ disabled = false, placeholder, onSend }: Props) => {
  const [value, setValue] = useState('')

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
