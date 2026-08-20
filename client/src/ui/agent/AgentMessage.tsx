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
 * The token a turn ends with. It is protocol, not something the analyst said,
 * and the runner only strips it from the answer it returns — the transcript
 * keeps the raw text, so the marker has to come off here or it renders as the
 * first words of the reply.
 */
const DONE_RE = /<\|\s*DONE\s*\|>/g

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

  // what to render as prose; tool output is shown verbatim instead
  const prose = message.content.replace(DONE_RE, '').trim()

  const cost =
    message.completionTokens === null ? null : (
      <span className="agents-msg-cost">
        {message.promptTokens}→{message.completionTokens}
      </span>
    )

  // Something plainly said: the name rides into the first line as a badge
  // rather than taking a header row of its own. In a column this narrow that
  // row cost more height than most of the messages under it.
  if (!foldable) {
    return (
      <li className={`agents-msg is-${message.role}`}>
        <div className="agents-msg-body">
          {cost}
          <span className="agents-msg-badge">{heading}</span>
          <Markdown text={prose} />
        </div>
      </li>
    )
  }

  // Folded, the header is not a label but the control that opens it, so it
  // stays a row: it carries the caret, the preview of what is inside, and the
  // whole of it is the click target.
  return (
    <li className={`agents-msg is-${message.role}`}>
      <button
        type="button"
        className={`agents-msg-head agents-msg-toggle${
          open ? '' : ' is-collapsed'
        }`}
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
      >
        <span className={`agents-msg-caret${open ? ' is-open' : ''}`} />
        <span className="agents-msg-role">{heading}</span>
        {!open && (
          <span className="agents-msg-preview">{summarize(message.content)}</span>
        )}
        {cost}
      </button>

      {open &&
        // Tool output is laid out with its own alignment and indentation, so
        // it stays preformatted. What the analyst wrote is prose, and prose
        // gets rendered.
        (message.role === 'tool' ? (
          <pre className="agents-msg-body">{message.content}</pre>
        ) : (
          <div className="agents-msg-body">
            <Markdown text={prose} />
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
