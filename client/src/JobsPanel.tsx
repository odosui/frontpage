import { XIcon } from '@primer/octicons-react'
import { useEffect } from 'react'
import { type Job } from './api'
import { useJobs } from './contexts/JobsContext'

interface JobsPanelProps {
  /** Settled into place; false while it is still arriving or leaving. */
  shown: boolean
  onClose: () => void
}

/** Drops down from under the top bar, over the dashboard. */
const JobsPanel: React.FC<JobsPanelProps> = ({ shown, onClose }) => {
  const { jobs } = useJobs()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      {shown && <div className="jobs-backdrop" onClick={onClose} />}
      <section className={`jobs-panel${shown ? ' is-shown' : ''}`}>
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

        <div className="jobs-panel-body">
          {jobs.length === 0 ? (
            <p className="jobs-empty">No jobs yet</p>
          ) : (
            <ul className="jobs-list">
              {jobs.map((job) => (
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
  // a fetch names its source, an agent run names its dashboard; nothing names
  // both any more, since a source is not owned by an arc
  const target = [job.payload.sourceId, job.payload.dashboardId]
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
