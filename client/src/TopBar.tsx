import { HomeIcon, GearIcon, ZapIcon } from '@primer/octicons-react'
import { Link, useLocation } from 'slim-react-router'
import { useJobs } from './contexts/JobsContext'

const NAV_ITEMS = [
  { path: '/db/default', icon: HomeIcon },
  { path: '/settings', icon: GearIcon },
]

interface TopBarProps {
  jobsOpen: boolean
  onToggleJobs: () => void
}

const TopBar: React.FC<TopBarProps> = ({ jobsOpen, onToggleJobs }) => {
  const location = useLocation()
  const { activeCount, stats } = useJobs()

  return (
    <header className="topbar">
      <nav className="topbar-nav">
        {NAV_ITEMS.map(({ path, icon: Icon }) => (
          <Link
            key={path}
            to={path}
            className={`topbar-item${location.pathname.startsWith(path) ? ' active' : ''}`}
          >
            <Icon size={18} />
          </Link>
        ))}
      </nav>

      <button
        className={`topbar-jobs${jobsOpen ? ' active' : ''}${
          activeCount > 0 ? ' is-active' : ''
        }`}
        onClick={onToggleJobs}
        aria-label="Jobs"
        aria-expanded={jobsOpen}
      >
        <ZapIcon size={16} />
        <span className="topbar-jobs-label">{jobsLabel(activeCount)}</span>
        {stats.failed > 0 && (
          <span className="topbar-jobs-failed">{stats.failed} failed</span>
        )}
      </button>
    </header>
  )
}

function jobsLabel(activeCount: number): string {
  if (activeCount === 0) return 'No jobs running'
  return `${activeCount} job${activeCount > 1 ? 's' : ''} running`
}

export default TopBar
