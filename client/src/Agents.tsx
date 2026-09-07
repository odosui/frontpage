import { useState } from 'react'
import Chat from './Chat'
import { useAgentChat } from './ui/agent/useAgentChat'
import { agentLabel, conversationTitle } from './ui/agent/conversationLabels'

type Props = {
  dashboardId: string
  dashboardName: string
  prompt: string
  onSavePrompt: (prompt: string) => Promise<void>
  onChanged?: () => void
  active: boolean
  onClose: () => void
}

const Agents = ({
  dashboardId,
  dashboardName,
  prompt,
  onSavePrompt,
  onChanged,
  active,
  onClose,
}: Props) => {
  const c = useAgentChat({ dashboardId, active, onChanged })
  const [history, setHistory] = useState(false)
  const [filter, setFilter] = useState('')
  const shown = c.sessions.filter((s) =>
    `${conversationTitle(s)} ${agentLabel(s.kind)}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  )
  return (
    <div className="conversation-workspace">
      <header className="conversation-toolbar">
        <strong>Conversations</strong>
        <button
          type="button"
          onClick={() => {
            c.select(null)
            setHistory(false)
          }}
        >
          New chat
        </button>
        <button
          className="conversation-history-toggle"
          type="button"
          onClick={() => setHistory((v) => !v)}
          aria-expanded={history}
        >
          History
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close conversations"
        >
          ×
        </button>
      </header>
      <div className="conversation-body">
        <aside
          className={`agents-sidebar conversation-sidebar${history ? ' is-open' : ''}`}
        >
          <input
            className="conversation-search"
            aria-label="Search conversations"
            placeholder="Search conversations…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <ul className="agents-sessions">
            {shown.map((s) => (
              <li key={s.id}>
                <button
                  className={`agents-session${s.id === c.selected ? ' is-active' : ''}`}
                  onClick={() => {
                    c.select(s.id)
                    setHistory(false)
                  }}
                >
                  <span className="agents-session-top">
                    <span
                      className={`agents-dot is-${s.status}`}
                      aria-label={s.status}
                    />
                    <strong>{conversationTitle(s)}</strong>
                  </span>
                  <span className="agents-session-time">
                    {agentLabel(s.kind)} ·{' '}
                    {new Date(s.updatedAt || s.createdAt).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </button>
              </li>
            ))}
            {shown.length === 0 && (
              <li className="agents-empty">
                {filter
                  ? 'No matching conversations'
                  : 'Your chats and runs will appear here.'}
              </li>
            )}
          </ul>
        </aside>
        <Chat
          conversation={c}
          dashboardName={dashboardName}
          active={active}
          prompt={prompt}
          onSavePrompt={onSavePrompt}
        />
      </div>
    </div>
  )
}
export default Agents
