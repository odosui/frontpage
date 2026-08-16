import { type AgentMessage } from './api'
import AgentTranscript from './ui/agent/AgentTranscript'
import ChatComposer from './ui/agent/ChatComposer'
import { useAgentChat } from './ui/agent/useAgentChat'

type Props = {
  dashboardId: string
  /** The arc the conversation is about, by slug — the server reads it up. */
  storyline: string
}

/** In a conversation the roles are people, not job descriptions. */
const CHAT_LABEL: Partial<Record<AgentMessage['role'], string>> = {
  user: 'You',
  assistant: 'Analyst',
}

/**
 * The agent you talk to about one storyline. The transcript and its message
 * cards are the same ones the agents view uses; what is added here is the
 * composer and a session that stays open between questions.
 */
const StorylineChat = ({ dashboardId, storyline }: Props) => {
  const { session, messages, thinking, error, send } = useAgentChat({
    dashboardId,
    kind: 'analyzing_agent',
    storyline,
  })

  // the system message is the agent's own instructions, not part of the
  // conversation; a tool result reads as the agent working, so it stays
  const visible = messages.filter((m) => m.role !== 'system')

  return (
    <div className="chat">
      <header className="chat-head">
        <h2 className="chat-heading">Chat</h2>
        {session && <span className="chat-model">{session.model}</span>}
      </header>

      <div className="chat-transcript">
        {visible.length === 0 && !thinking ? (
          <p className="chat-placeholder">
            Ask about this storyline — what changed, what it follows from, who
            someone is. The agent can read the dashboard and search the web.
          </p>
        ) : (
          <AgentTranscript
            messages={visible}
            thinking={thinking}
            labelFor={(m) => CHAT_LABEL[m.role]}
          />
        )}
      </div>

      {error && <p className="agents-error chat-error">{error}</p>}

      <ChatComposer
        disabled={thinking}
        placeholder="Ask about this storyline…"
        onSend={send}
      />
    </div>
  )
}

export default StorylineChat
