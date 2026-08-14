import { HomeIcon, GearIcon, ZapIcon } from '@primer/octicons-react'
import { Link, useLocation } from 'slim-react-router'
import { useJobs } from './contexts/JobsContext'
import { useToolbar } from './contexts/ToolbarContext'
import ChannelsMenu from './ChannelsMenu'
import DashboardSwitcher from './DashboardSwitcher'
import RefreshIcon from './icons/RefreshIcon'
import PlusIcon from './icons/PlusIcon'

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
  const { tools } = useToolbar()

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

      {tools && (
        <DashboardSwitcher
          dashboards={tools.dashboards}
          current={tools.current}
          onSelect={tools.onSelect}
          onCreate={tools.onCreate}
          onDelete={tools.onDelete}
          onRename={tools.onRename}
        />
      )}

      <div className="topbar-actions">
        {tools && (
          <>
            <ChannelsMenu
              channels={tools.channels}
              refreshing={tools.refreshingChannels}
              errors={tools.channelErrors}
              onRefresh={tools.onRefreshChannel}
              onDelete={tools.onDeleteChannel}
            />
            <button className="topbar-btn" onClick={tools.onAddChannel}>
              <PlusIcon />
              Add channel
            </button>
            <button
              className={`topbar-btn${tools.isRefreshing ? ' is-refreshing' : ''}`}
              onClick={tools.onRefreshAll}
              disabled={tools.isRefreshing}
            >
              <RefreshIcon />
              Refresh all
            </button>
          </>
        )}

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
      </div>
    </header>
  )
}

function jobsLabel(activeCount: number): string {
  if (activeCount === 0) return 'No jobs running'
  return `${activeCount} job${activeCount > 1 ? 's' : ''} running`
}

export default TopBar
