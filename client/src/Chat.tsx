import { useEffect, useRef } from 'react'
import AgentTranscript from './ui/agent/AgentTranscript'
import ChatComposer from './ui/agent/ChatComposer'
import ProposalCard from './ui/agent/ProposalCard'
import DashboardPrompt from './ui/agent/DashboardPrompt'
import type { Conversation } from './ui/agent/useAgentChat'
import { conversationTitle, agentLabel } from './ui/agent/conversationLabels'

type Props = {
  conversation: Conversation
  dashboardName: string
  active: boolean
  prompt: string
  onSavePrompt: (prompt: string) => Promise<void>
}

const Chat = ({
  conversation: c,
  dashboardName,
  active,
  prompt,
  onSavePrompt,
}: Props) => {
  const scroll = useRef<HTMLDivElement>(null)
  const lastSession = useRef<number | null>(null)
  useEffect(() => {
    if (c.session && lastSession.current !== c.session.id) {
      lastSession.current = c.session.id
      if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight
    }
  }, [c.session, c.messages])

  const visible = c.messages.filter((m) => m.role !== 'system')
  const instructions = c.messages.filter((m) => m.role === 'system')
  const tokens = c.messages.reduce(
    (sum, m) => sum + (m.promptTokens ?? 0) + (m.completionTokens ?? 0),
    0,
  )
  const asking = c.proposals.filter(
    (p) => p.status === 'pending' || p.status === 'failed',
  )

  return (
    <section className="chat conversation-chat">
      <header className="conversation-head">
        <div>
          <h2>
            {c.session
              ? conversationTitle(c.session)
              : c.loading
                ? 'Loading conversation…'
                : 'New conversation'}
          </h2>
          <p>
            {c.session
              ? `${agentLabel(c.session.kind)} · ${c.thinking ? 'Working…' : c.session.status === 'failed' ? 'Failed · you can try again' : 'Ready for a follow-up'}`
              : dashboardName}
          </p>
        </div>
        <details className="conversation-details" key={c.selected ?? 'new'}>
          <summary>Details</summary>
          <div className="conversation-details-body">
            {c.session && (
              <p>
                #{c.session.id} · {c.session.model}
                <br />
                {c.messages.length} messages · {tokens.toLocaleString()} tokens
              </p>
            )}
            <DashboardPrompt value={prompt} onSave={onSavePrompt} />
            {instructions.length > 0 && (
              <details>
                <summary>Instructions ({instructions.length})</summary>
                <AgentTranscript messages={instructions} />
              </details>
            )}
          </div>
        </details>
      </header>
      <div className="conversation-scroll" ref={scroll}>
        {visible.length > 0 ? (
          <AgentTranscript
            messages={visible}
            thinking={c.thinking}
            labelFor={(m) =>
              m.role === 'user'
                ? 'You / task'
                : m.role === 'assistant'
                  ? agentLabel(c.session?.kind ?? 'analyzing_agent')
                  : undefined
            }
          />
        ) : (
          <div className="conversation-empty">
            <h3>
              {c.loading
                ? 'Loading…'
                : c.thinking
                  ? 'The agent is getting started…'
                  : `Explore ${dashboardName}`}
            </h3>
            {!c.loading && !c.thinking && (
              <p>
                Ask a question, or choose an earlier chat or agent run from the
                history.
              </p>
            )}
          </div>
        )}
        {c.pendingUser && (
          <p className="conversation-pending">
            <strong>You</strong> {c.pendingUser}
          </p>
        )}
        {asking.length > 0 && (
          <ul className="proposals">
            {asking.map((p) => (
              <ProposalCard key={p.id} proposal={p} onDecide={c.decide} />
            ))}
          </ul>
        )}
      </div>
      {(c.error || c.session?.error) && (
        <p role="alert" className="agents-error conversation-feedback">
          {c.error || c.session?.error}
        </p>
      )}
      <ChatComposer
        disabled={c.thinking || c.loading}
        focused={active}
        value={c.draft}
        onChange={c.setDraft}
        placeholder={
          c.session ? 'Ask a follow-up…' : `Ask about ${dashboardName}…`
        }
        onSend={c.send}
      />
    </section>
  )
}
export default Chat
