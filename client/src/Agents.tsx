import { useCallback, useEffect, useRef, useState } from 'react'
import api, {
  type AgentInfo,
  type AgentMessage,
  type AgentSession,
} from './api'
import { useJobs } from './contexts/JobsContext'

/** While a session is running its transcript grows every few seconds. */
const LIVE_POLL_MS = 1000
const IDLE_POLL_MS = 6000

const ROLE_LABEL: Record<AgentMessage['role'], string> = {
  system: 'Instructions',
  user: 'Task',
  assistant: 'Agent',
  tool: 'Function',
}

/** The agents view: session list on the left, live transcript on the right. */
const Agents: React.FC<{ dashboardId: string }> = ({ dashboardId }) => {
  const { refresh: refreshJobs } = useJobs()
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [session, setSession] = useState<AgentSession | null>(null)
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSessions = useCallback(async () => {
    try {
      const data: { sessions: AgentSession[] } =
        await api.listAgentSessions(dashboardId)
      setSessions(data.sessions)
      // land on the newest session the first time round
      setSelected((current) => current ?? data.sessions[0]?.id ?? null)
    } catch {
      // keep whatever is on screen; the next tick retries
    }
  }, [dashboardId])

  useEffect(() => {
    // a different dashboard is a different set of sessions
    setSelected(null)
    setSession(null)
    setMessages([])
  }, [dashboardId])

  useEffect(() => {
    api
      .listAgents()
      .then((data: { agents: AgentInfo[] }) => setAgents(data.agents))
      .catch(() => setError('could not load the agent list'))
    loadSessions()
  }, [loadSessions])

  // one self-rescheduling loop, ticking fast only while something is running
  useEffect(() => {
    if (selected === null) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    const tick = async () => {
      try {
        const data: { session: AgentSession; messages: AgentMessage[] } =
          await api.getAgentSession(selected)
        if (cancelled) return
        setSession(data.session)
        setMessages(data.messages)
        const live = data.session.status === 'running'
        if (live) loadSessions()
        timer = setTimeout(tick, live ? LIVE_POLL_MS : IDLE_POLL_MS)
      } catch {
        if (!cancelled) timer = setTimeout(tick, IDLE_POLL_MS)
      }
    }
    tick()

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [selected, loadSessions])

  const start = async (kind: string) => {
    setStarting(true)
    setError(null)
    try {
      await api.runAgent(dashboardId, kind)
      refreshJobs()
      // the session row appears once the worker picks the job up
      setTimeout(loadSessions, 500)
    } catch {
      setError('could not start the agent')
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="agents">
      <aside className="agents-sidebar">
        <div className="agents-launch">
          {agents.map((agent) => (
            <button
              key={agent.kind}
              className="agents-run-btn"
              disabled={starting}
              onClick={() => start(agent.kind)}
            >
              Run {agent.name}
            </button>
          ))}
          {error && <p className="agents-error">{error}</p>}
        </div>

        <ul className="agents-sessions">
          {sessions.map((s) => (
            <li key={s.id}>
              <button
                className={`agents-session${s.id === selected ? ' is-active' : ''}`}
                onClick={() => setSelected(s.id)}
              >
                <span className="agents-session-top">
                  <span className={`agents-dot is-${s.status}`} />
                  <span className="agents-session-id">#{s.id}</span>
                  <span className="agents-session-time">
                    {new Date(s.createdAt).toLocaleTimeString()}
                  </span>
                </span>
                <span className="agents-session-model">{s.model}</span>
              </button>
            </li>
          ))}
          {sessions.length === 0 && (
            <li className="agents-empty">No sessions yet</li>
          )}
        </ul>
      </aside>

      <section className="agents-transcript">
        {session ? (
          <Transcript session={session} messages={messages} />
        ) : (
          <p className="agents-empty">Run an agent to watch it work.</p>
        )}
      </section>
    </div>
  )
}

const Transcript: React.FC<{
  session: AgentSession
  messages: AgentMessage[]
}> = ({ session, messages }) => {
  const bottom = useRef<HTMLLIElement>(null)
  const live = session.status === 'running'

  // follow the conversation as turns arrive, but only while it is still going
  useEffect(() => {
    if (live) bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, live])

  const tokens = messages.reduce(
    (sum, m) => sum + (m.promptTokens ?? 0) + (m.completionTokens ?? 0),
    0,
  )

  return (
    <>
      <header className="agents-head">
        <h2 className="agents-title">
          <span className={`agents-dot is-${session.status}`} />
          Session #{session.id}
        </h2>
        <div className="agents-meta">
          <span className="agents-meta-item">{session.kind}</span>
          <span className="agents-meta-item">{session.model}</span>
          <span className="agents-meta-item">{messages.length} turns</span>
          <span className="agents-meta-item">
            {tokens.toLocaleString()} tokens
          </span>
        </div>
        {session.error && <p className="agents-error">{session.error}</p>}
      </header>

      <ol className="agents-messages">
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
        {live && (
          <li className="agents-msg is-pending">
            <span className="agents-thinking">thinking…</span>
          </li>
        )}
        <li ref={bottom} />
      </ol>
    </>
  )
}

/** One turn: who spoke, what it cost, and the whole of what was said. */
const Message: React.FC<{ message: AgentMessage }> = ({ message }) => {
  const label =
    message.role === 'tool' && message.toolName
      ? `${message.toolName} ${(message.toolArgs ?? []).join(' ')}`
      : ROLE_LABEL[message.role]

  return (
    <li className={`agents-msg is-${message.role}`}>
      <header className="agents-msg-head">
        <span className="agents-msg-role">{label}</span>
        {message.completionTokens !== null && (
          <span className="agents-msg-tokens">
            {message.promptTokens}→{message.completionTokens}
          </span>
        )}
      </header>
      <pre className="agents-msg-body">{message.content}</pre>
    </li>
  )
}

export default Agents
