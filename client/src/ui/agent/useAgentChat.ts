import { useCallback, useEffect, useRef, useState } from 'react'
import api, {
  type AgentMessage,
  type AgentSession,
  type Proposal,
} from '../../api'
import { useJobs } from '../../contexts/JobsContext'

type SessionData = {
  session: AgentSession
  messages: AgentMessage[]
  proposals?: Proposal[]
}
type Options = { dashboardId: string; active?: boolean; onChanged?: () => void }

/** One selected conversation and its drafts, kept while the workspace is closed. */
export function useAgentChat({
  dashboardId,
  active = true,
  onChanged,
}: Options) {
  const { jobs, refresh: refreshJobs } = useJobs()
  const storageKey = `conversation:${dashboardId}`
  const [selected, setSelected] = useState<number | null>(() => {
    try {
      return Number(localStorage.getItem(storageKey)) || null
    } catch {
      return null
    }
  })
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [data, setData] = useState<SessionData | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingUser, setPendingUser] = useState<{
    sessionId: number
    content: string
    afterId: number
  } | null>(null)
  const [refresh, setRefresh] = useState(0)
  const sendingRef = useRef(false)
  const selectedRef = useRef(selected)
  const completed = useRef(new Set<string>())
  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged
  selectedRef.current = selected

  const select = useCallback(
    (id: number | null) => {
      selectedRef.current = id
      setSelected(id)
      setError(null)
      try {
        localStorage.setItem(storageKey, String(id ?? ''))
      } catch {
        /* optional persistence */
      }
    },
    [storageKey],
  )

  const session = data?.session.id === selected ? data.session : null
  const messages = session ? data!.messages : []
  const proposals = session ? (data!.proposals ?? []) : []
  const activeJob = jobs.some(
    (job) =>
      (job.payload.sessionId === selected ||
        job.result?.sessionId === selected) &&
      (job.status === 'queued' || job.status === 'running'),
  )
  const thinking = sending || session?.status === 'running' || activeJob
  const loading = selected !== null && !session
  const draftKey = String(selected ?? 'new')
  const draft = drafts[draftKey] ?? ''
  const setDraft = (value: string) =>
    setDrafts((old) => ({ ...old, [draftKey]: value }))

  useEffect(() => {
    if (!active && !thinking) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      try {
        const result: { sessions: AgentSession[] } =
          await api.listAgentSessions(dashboardId, 200)
        if (!cancelled) setSessions(result.sessions)
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      }
      if (!cancelled) timer = setTimeout(tick, thinking ? 1200 : 5000)
    }
    tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [dashboardId, active, thinking, refresh])

  useEffect(() => {
    if (selected === null || (!active && !thinking)) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      try {
        const result: SessionData = await api.getAgentSession(selected)
        if (cancelled) return
        setData(result)
        setPendingUser((pending) =>
          pending?.sessionId === selected &&
          result.messages.some(
            (m) =>
              m.id > pending.afterId &&
              m.role === 'user' &&
              m.content === pending.content,
          )
            ? null
            : pending,
        )
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      }
      if (!cancelled) timer = setTimeout(tick, 1200)
    }
    tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [selected, active, thinking, refresh])

  // Observe job state directly: a fast job can finish before a polling client
  // ever sees it running, so a transition-only subscription misses it.
  useEffect(() => {
    for (const job of jobs) {
      const belongs =
        job.payload.sessionId === selected || job.result?.sessionId === selected
      if (
        belongs &&
        (job.status === 'failed' || job.status === 'succeeded') &&
        !completed.current.has(job.id)
      ) {
        completed.current.add(job.id)
        setRefresh((n) => n + 1)
        onChangedRef.current?.()
        if (job.status === 'failed') {
          setPendingUser(null)
        }
      }
    }
  }, [jobs, selected])

  const send = async (content: string) => {
    if (sendingRef.current || thinking || loading) return
    sendingRef.current = true
    setSending(true)
    setError(null)
    const key = draftKey
    const originalSelection = selected
    try {
      let id = selected
      if (id === null) {
        const started: { session: AgentSession } = await api.startChat(
          dashboardId,
          'analyzing_agent',
        )
        id = started.session.id
        setData({ session: started.session, messages: [] })
        setDrafts((old) => ({
          ...old,
          [String(id)]: old[key] ?? '',
          [key]: '',
        }))
        if (selectedRef.current === originalSelection) select(id)
      }
      await api.sendChatMessage(id, content)
      setPendingUser({
        sessionId: id,
        content,
        afterId: messages[messages.length - 1]?.id ?? 0,
      })
      setDrafts((old) => ({ ...old, [String(id)]: '' }))
      setData((old) =>
        old?.session.id === id
          ? {
              ...old,
              session: { ...old.session, status: 'running', error: null },
            }
          : old,
      )
      setRefresh((n) => n + 1)
      refreshJobs()
    } catch (err) {
      setError((err as Error).message)
      setRefresh((n) => n + 1)
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  const decide = async (id: number, approve: boolean) => {
    setError(null)
    try {
      const done: { proposal: Proposal } = await api.decideProposal(id, approve)
      if (done.proposal.status === 'failed')
        setError(done.proposal.error || 'The change failed.')
      if (done.proposal.status === 'approved') onChangedRef.current?.()
      setRefresh((n) => n + 1)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return {
    selected,
    select,
    sessions,
    session,
    messages,
    proposals,
    thinking,
    loading,
    error,
    draft,
    setDraft,
    send,
    decide,
    pendingUser:
      pendingUser?.sessionId === selected ? pendingUser.content : null,
  }
}

export type Conversation = ReturnType<typeof useAgentChat>
