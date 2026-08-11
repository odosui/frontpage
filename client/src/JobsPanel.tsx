import { XIcon } from '@primer/octicons-react'
import { useEffect, useState } from 'react'
import { JOB_STATUSES, type Job, type JobStatus } from './api'
import { useJobs } from './contexts/JobsContext'

type Filter = 'all' | JobStatus

const FILTERS: Filter[] = ['all', ...JOB_STATUSES]

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Done',
  failed: 'Failed',
}

interface JobsPanelProps {
  onClose: () => void
}

/** Drops down from under the top bar, over the dashboard. */
const JobsPanel: React.FC<JobsPanelProps> = ({ onClose }) => {
  const { jobs, stats } = useJobs()
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const visible =
    filter === 'all' ? jobs : jobs.filter((job) => job.status === filter)

  return (
    <>
      <div className="jobs-backdrop" onClick={onClose} />
      <section className="jobs-panel">
        <header className="jobs-panel-header">
          <h2 className="jobs-panel-title">Jobs</h2>
          <button
            className="jobs-panel-close"
            onClick={onClose}
            aria-label="Close jobs panel"
          >
            <XIcon size={16} />
          </button>
        </header>

        <div className="jobs-filters">
          {FILTERS.map((f) => (
            <button
              key={f}
              className={`jobs-filter${filter === f ? ' is-active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : STATUS_LABEL[f]}
              <span className="jobs-filter-count">
                {f === 'all' ? jobs.length : (stats[f] ?? 0)}
              </span>
            </button>
          ))}
        </div>

        <div className="jobs-panel-body">
          {visible.length === 0 ? (
            <p className="jobs-empty">
              {jobs.length === 0 ? 'No jobs yet' : `No ${filter} jobs`}
            </p>
          ) : (
            <ul className="jobs-list">
              {visible.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  )
}

const JobRow: React.FC<{ job: Job }> = ({ job }) => {
  const target = [job.payload.dashboardId, job.payload.widgetId]
    .filter(Boolean)
    .join(' / ')

  return (
    <li className={`job-row job-row--${job.status}`}>
      <div className="job-row-main">
        <span className={`job-dot job-dot--${job.status}`} />
        <span className="job-type">{job.type}</span>
        <span className="job-timing">{timing(job)}</span>
      </div>
      {target && <div className="job-target">{target}</div>}
      {job.error && <div className="job-error">{job.error}</div>}
      {!job.error && job.attempts > 1 && (
        <div className="job-attempts">
          attempt {job.attempts} of {job.maxAttempts}
        </div>
      )}
    </li>
  )
}

/** Elapsed time for live jobs, "x ago" once they are finished. */
function timing(job: Job): string {
  if (job.status === 'running' && job.startedAt) {
    return `${seconds(job.startedAt)}s`
  }
  if (job.status === 'queued') {
    return 'waiting'
  }
  const finished = job.finishedAt ?? job.updatedAt
  const duration =
    job.startedAt && job.finishedAt
      ? ` · ${seconds(job.startedAt, job.finishedAt)}s`
      : ''
  return `${ago(finished)}${duration}`
}

function seconds(from: string, to?: string): number {
  const end = to ? new Date(to).getTime() : Date.now()
  return Math.max(0, Math.round((end - new Date(from).getTime()) / 1000))
}

/** Compact "12s / 9m / 3h / 2d ago" — the panel column is narrow. */
function ago(date: string): string {
  const secs = seconds(date, new Date().toISOString())
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

export default JobsPanel
