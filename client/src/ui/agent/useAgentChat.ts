import { useCallback, useEffect, useRef, useState } from 'react'
import api, { type AgentMessage, type AgentSession, type Job } from '../../api'
import { useJobs } from '../../contexts/JobsContext'

/** While a turn is in flight the transcript grows every few seconds. */
const LIVE_POLL_MS = 1200

type Options = {
  dashboardId: string
  kind: string
  /**
   * The storyline the chat was opened from, by slug. The server turns it into
   * the agent's opening context — the client never writes the prompt.
   */
  storyline?: string
}

/**
 * Owns one conversation: opens the session lazily on the first question, sends
 * each turn, and follows the transcript while the worker answers.
 *
 * The session is opened on the first message rather than on mount, so a page
 * nobody talks to leaves no empty sessions behind.
 */
export function useAgentChat({ dashboardId, kind, storyline }: Options) {
  const { refresh: refreshJobs, onJobFinished } = useJobs()
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [session, setSession] = useState<AgentSession | null>(null)
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // the reply job we are waiting on, so a turn is only "done" when it is
  const pendingJob = useRef<string | null>(null)

  // a different dashboard or arc is a different conversation
  useEffect(() => {
    setSessionId(null)
    setSession(null)
    setMessages([])
    setThinking(false)
    setError(null)
    pendingJob.current = null
  }, [dashboardId, kind, storyline])

  // follow the transcript while a turn is being worked on
  useEffect(() => {
    if (sessionId === null || !thinking) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    const tick = async () => {
      try {
        const data: { session: AgentSession; messages: AgentMessage[] } =
          await api.getAgentSession(sessionId)
        if (cancelled) return
        setSession(data.session)
        setMessages(data.messages)
      } catch {
        // keep what is on screen; the next tick retries
      }
      if (!cancelled) timer = setTimeout(tick, LIVE_POLL_MS)
    }
    tick()

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [sessionId, thinking])

  // the job finishing is what ends the turn — an assistant message alone
  // doesn't, since the agent posts one every time it calls a tool too
  useEffect(() => {
    return onJobFinished((job: Job) => {
      if (job.id !== pendingJob.current) return
      pendingJob.current = null
      setThinking(false)
      if (job.status === 'failed') {
        setError(job.error || 'the agent could not answer')
      }
      // one last read, to pick up the turn's closing messages
      if (sessionId !== null) {
        api
          .getAgentSession(sessionId)
          .then((data: { session: AgentSession; messages: AgentMessage[] }) => {
            setSession(data.session)
            setMessages(data.messages)
          })
          .catch(() => undefined)
      }
    })
  }, [onJobFinished, sessionId])

  const send = useCallback(
    async (content: string) => {
      setError(null)
      try {
        let id = sessionId
        if (id === null) {
          const started: { session: AgentSession } = await api.startChat(
            dashboardId,
            kind,
            storyline,
          )
          id = started.session.id
          setSessionId(id)
          setSession(started.session)
        }

        const queued: { job: Job } = await api.sendChatMessage(id, content)
        pendingJob.current = queued.job.id
        setThinking(true)
        refreshJobs()
      } catch (err) {
        setError((err as Error).message)
        setThinking(false)
      }
    },
    [sessionId, dashboardId, kind, storyline, refreshJobs],
  )

  return { session, messages, thinking, error, send }
}
