import { useEffect, useRef } from 'react'
import { type AgentMessage as Message } from '../../api'
import AgentMessage from './AgentMessage'

type Props = {
  messages: Message[]
  /** Whether to show the pending turn at the bottom. */
  thinking?: boolean
  /** Names the roles; the agents view and a chat label them differently. */
  labelFor?: (message: Message) => string | undefined
}

/**
 * The turns, scrolling. Follows the bottom while something is still coming in,
 * and leaves the reader alone once it isn't.
 */
const AgentTranscript = ({ messages, thinking = false, labelFor }: Props) => {
  const bottom = useRef<HTMLLIElement>(null)

  useEffect(() => {
    if (thinking) bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, thinking])

  return (
    <ol className="agents-messages">
      {messages.map((message) => (
        <AgentMessage
          key={message.id}
          message={message}
          {...(labelFor?.(message) ? { label: labelFor(message)! } : {})}
        />
      ))}
      {thinking && (
        <li className="agents-msg is-pending">
          <span className="agents-thinking">thinking…</span>
        </li>
      )}
      <li ref={bottom} />
    </ol>
  )
}

export default AgentTranscript
