import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react'
import api, { type Job, type JobStats } from '../api'

/** Poll fast while something is in flight, slowly when the queue is idle. */
const ACTIVE_POLL_MS = 1500
const IDLE_POLL_MS = 8000
const JOB_LIMIT = 100

const EMPTY_STATS: JobStats = {
  queued: 0,
  running: 0,
  succeeded: 0,
  failed: 0,
}

interface JobsContextValue {
  jobs: Job[]
  stats: JobStats
  /** Jobs still queued or running. */
  activeCount: number
  /** Re-poll now, e.g. right after enqueuing something. */
  refresh: () => void
  /**
   * Subscribe to jobs reaching a terminal state. Returns an unsubscribe fn.
   * Used by the dashboard to reload the feed once a source's analysis lands.
   */
  onJobFinished: (listener: (job: Job) => void) => () => void
}

const JobsContext = createContext<JobsContextValue | undefined>(undefined)

export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [stats, setStats] = useState<JobStats>(EMPTY_STATS)

  // status of each job as of the previous poll, to spot transitions
  const seen = useRef(new Map<string, string>())
  const listeners = useRef(new Set<(job: Job) => void>())
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // guards against a slow response landing after the component unmounts
  const alive = useRef(true)

  const poll = useCallback(async () => {
    try {
      const data: { jobs: Job[]; stats: JobStats } = await api.listJobs(
        JOB_LIMIT,
      )
      if (!alive.current) return

      const finished = data.jobs.filter((job) => {
        const previous = seen.current.get(job.id)
        const isTerminal = job.status === 'succeeded' || job.status === 'failed'
        return isTerminal && previous !== undefined && previous !== job.status
      })

      const next = new Map<string, string>()
      for (const job of data.jobs) next.set(job.id, job.status)
      seen.current = next

      setJobs(data.jobs)
      setStats(data.stats)

      for (const job of finished) {
        for (const listener of listeners.current) listener(job)
      }
    } catch {
      // the panel keeps showing the last known state; next tick retries
    }
  }, [])

  // bumping this restarts the loop below, which polls immediately
  const [nudge, setNudge] = useState(0)

  // one self-rescheduling loop, so the interval can follow queue activity
  useEffect(() => {
    alive.current = true
    let cancelled = false

    const tick = async () => {
      await poll()
      if (cancelled) return
      const active = [...seen.current.values()].some(
        (s) => s === 'queued' || s === 'running',
      )
      timer.current = setTimeout(tick, active ? ACTIVE_POLL_MS : IDLE_POLL_MS)
    }
    tick()

    return () => {
      cancelled = true
      alive.current = false
      if (timer.current) clearTimeout(timer.current)
    }
  }, [poll, nudge])

  const refresh = useCallback(() => setNudge((n) => n + 1), [])

  const onJobFinished = useCallback((listener: (job: Job) => void) => {
    listeners.current.add(listener)
    return () => {
      listeners.current.delete(listener)
    }
  }, [])

  const activeCount = stats.queued + stats.running

  return (
    <JobsContext.Provider
      value={{ jobs, stats, activeCount, refresh, onJobFinished }}
    >
      {children}
    </JobsContext.Provider>
  )
}

export function useJobs() {
  const context = useContext(JobsContext)
  if (context === undefined) {
    throw new Error('useJobs must be used within a JobsProvider')
  }
  return context
}
