import { useEffect, useRef } from 'react'
import { type AgentMessage } from './api'
import AgentTranscript from './ui/agent/AgentTranscript'
import ChatComposer from './ui/agent/ChatComposer'
import ProposalCard from './ui/agent/ProposalCard'
import { useAgentChat } from './ui/agent/useAgentChat'

type Props = {
  dashboardId: string
  /** The arc's name, for the placeholder. The server builds the real context. */
  dashboardName: string
  /**
   * Called whenever the agent may have changed what the page is showing: after
   * every finished turn, and after an approved proposal. The agent writes facts
   * and merges stories through its own tools, so the panes beside it cannot
   * know they are stale by any other means.
   */
  onChanged?: () => void
  /** Whether the chat is on screen; opening it puts the cursor in the composer. */
  active?: boolean
}

/** In a conversation the roles are people, not job descriptions. */
const CHAT_LABEL: Partial<Record<AgentMessage['role'], string>> = {
  user: 'You',
  assistant: 'Analyst',
}

/**
 * The agent you talk to about one arc. The transcript and its message cards are
 * the same ones the agents view uses; what is added here is the composer, a
 * session that stays open between questions, and the proposals it needs
 * answered before it can change anything.
 */
const Chat = ({ dashboardId, dashboardName, onChanged, active }: Props) => {
  const { session, messages, proposals, thinking, error, send, decide } =
    useAgentChat({ dashboardId, kind: 'analyzing_agent' })

  // A turn ending is the moment anything it wrote exists. Watching the flag
  // rather than the transcript: a turn writes several messages, and only its
  // end means the tools have all run.
  const wasThinking = useRef(false)
  useEffect(() => {
    if (wasThinking.current && !thinking) onChanged?.()
    wasThinking.current = thinking
  }, [thinking, onChanged])

  // the system message is the agent's own instructions, not part of the
  // conversation; a tool result reads as the agent working, so it stays
  const visible = messages.filter((m) => m.role !== 'system')

  // Only what still needs an answer, plus anything that went wrong — once a
  // proposal is decided the outcome is in the transcript, and leaving the card
  // there would keep asking a question that has been answered.
  const asking = proposals.filter(
    (p) => p.status === 'pending' || p.status === 'failed',
  )
  const empty = visible.length === 0 && asking.length === 0 && !thinking

  const onDecide = async (id: number, approve: boolean) => {
    const decided = await decide(id, approve)
    // an approved merge rewrote the stories this page is showing
    if (decided?.status === 'approved') onChanged?.()
  }

  return (
    <div className="chat">
      <header className="col-head">
        <h2 className="col-heading">Chat</h2>
        {session && <span className="chat-model">{session.model}</span>}
      </header>

      <div className="col-body chat-transcript">
        {!empty && (
          <>
            <AgentTranscript
              messages={visible}
              thinking={thinking}
              labelFor={(m) => CHAT_LABEL[m.role]}
            />
            {asking.length > 0 && (
              <ul className="proposals">
                {asking.map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    onDecide={onDecide}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {error && <p className="agents-error chat-error">{error}</p>}

      <ChatComposer
        disabled={thinking}
        focused={active}
        placeholder={`Ask about ${dashboardName}…`}
        onSend={send}
      />
    </div>
  )
}

export default Chat
