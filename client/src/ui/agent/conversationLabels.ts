import type { AgentSession } from '../../api'

export function agentLabel(kind: string): string {
  return (
    {
      facts_agent: 'Facts',
      predictions_agent: 'Predictions',
      categorizing_agent: 'Categorizer',
      analyzing_agent: 'Analyst',
    }[kind] ?? kind
  )
}

export function conversationTitle(session: AgentSession): string {
  return (
    session.title ||
    {
      facts_agent: 'Facts update',
      predictions_agent: 'Predictions update',
      categorizing_agent: 'Categorize stories',
      analyzing_agent: 'Analysis',
    }[session.kind] ||
    'Conversation'
  )
}
