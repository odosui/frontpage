import {
  HomeIcon,
  GearIcon,
  ZapIcon,
  DependabotIcon,
} from '@primer/octicons-react'
import { useState } from 'react'
import { Link, useLocation } from 'slim-react-router'
import { useJobs } from './contexts/JobsContext'
import { useToolbar } from './contexts/ToolbarContext'
import AgentsModal from './AgentsModal'
import ChannelsMenu from './ChannelsMenu'
import DashboardSwitcher from './DashboardSwitcher'

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
  const { activeCount } = useJobs()
  const { tools } = useToolbar()
  const [agentsOpen, setAgentsOpen] = useState(false)

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
              isRefreshingAll={tools.isRefreshing}
              onRefresh={tools.onRefreshChannel}
              onDelete={tools.onDeleteChannel}
              onAdd={tools.onAddChannel}
              onRefreshAll={tools.onRefreshAll}
            />
            <button
              className={`topbar-btn${agentsOpen ? ' active' : ''}`}
              onClick={() => setAgentsOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={agentsOpen}
            >
              <DependabotIcon size={16} />
              Agents
            </button>
            <AgentsModal
              isOpen={agentsOpen}
              onClose={() => setAgentsOpen(false)}
              dashboardId={tools.current}
            />
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
          <span className="topbar-jobs-label">
            {/* holds the width open at the longest label, so the button
                doesn't resize as jobs come and go */}
            <span className="topbar-jobs-sizer" aria-hidden="true">
              {jobsLabel(0)}
            </span>
            <span className="topbar-jobs-value">{jobsLabel(activeCount)}</span>
          </span>
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
