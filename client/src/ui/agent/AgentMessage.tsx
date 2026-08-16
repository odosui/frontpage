import { useState } from 'react'
import { type AgentMessage as Message } from '../../api'
import Markdown from '../Markdown'

export const ROLE_LABEL: Record<Message['role'], string> = {
  system: 'Instructions',
  user: 'Task',
  assistant: 'Agent',
  tool: 'Function',
}

type Props = {
  message: Message
  /** Overrides the role label — a chat calls the user's turn "You", not "Task". */
  label?: string
}

/** A call the agent wrote, `<|DONE|>` aside — that one ends a turn, not starts a lookup. */
const CALL_RE = /<\|\s*(?!DONE\s*\|)[A-Z][A-Z0-9_]*[^|]*\|>/

/**
 * One turn: who spoke, what it cost, and the whole of what was said.
 *
 * A tool result starts folded away. It is the evidence behind the answer rather
 * than part of the conversation — worth having, not worth scrolling past every
 * time — so the header opens it and the preview says what is in there.
 */
const AgentMessage = ({ message, label }: Props) => {
  // An assistant turn that calls something is the agent going to look, not the
  // agent answering. Models sometimes write a guess at the result underneath
  // the call; folding it keeps that guess from reading as the answer, which
  // arrives in a later message once the results are actually in.
  const working = message.role === 'assistant' && CALL_RE.test(message.content)
  const foldable = message.role === 'tool' || working
  const [open, setOpen] = useState(false)

  const heading =
    (working ? `${label ?? ROLE_LABEL.assistant} · looking things up` : label) ??
    (message.role === 'tool' && message.toolName
      ? `${message.toolName} ${(message.toolArgs ?? []).join(' ')}`
      : ROLE_LABEL[message.role])

  const head = (
    <>
      {foldable && <span className={`agents-msg-caret${open ? ' is-open' : ''}`} />}
      <span className="agents-msg-role">{heading}</span>
      {foldable && !open && (
        <span className="agents-msg-preview">{summarize(message.content)}</span>
      )}
      {message.completionTokens !== null && (
        <span className="agents-msg-tokens">
          {message.promptTokens}→{message.completionTokens}
        </span>
      )}
    </>
  )

  return (
    <li className={`agents-msg is-${message.role}`}>
      {foldable ? (
        <button
          type="button"
          className={`agents-msg-head agents-msg-toggle${
            open ? '' : ' is-collapsed'
          }`}
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
        >
          {head}
        </button>
      ) : (
        <header className="agents-msg-head">{head}</header>
      )}

      {(!foldable || open) &&
        // Tool output is laid out with its own alignment and indentation, so
        // it stays preformatted. What a person or the analyst wrote is prose,
        // and prose gets rendered.
        (message.role === 'tool' ? (
          <pre className="agents-msg-body">{message.content}</pre>
        ) : (
          <div className="agents-msg-body">
            <Markdown text={message.content} />
          </div>
        ))}
    </li>
  )
}

/** What a folded result says about itself: its first line, and how much more. */
function summarize(content: string): string {
  const lines = content.trim().split('\n')
  const first = lines[0] ?? ''
  const rest = lines.length - 1
  return rest > 0 ? `${first} +${rest} more` : first
}

export default AgentMessage
