import {
  GearIcon,
  HomeIcon,
  SignOutIcon,
  ZapIcon,
  DependabotIcon,
} from '@primer/octicons-react'
import { useState } from 'react'
import { Link, useLocation } from 'slim-react-router'
import { useAuth } from './contexts/AuthContext'
import { useJobs } from './contexts/JobsContext'
import { useToolbar } from './contexts/ToolbarContext'
import AgentsModal from './AgentsModal'
import DashboardSwitcher from './DashboardSwitcher'
import LatestMenu from './LatestMenu'
import SourcesMenu from './SourcesMenu'

interface TopBarProps {
  jobsOpen: boolean
  onToggleJobs: () => void
}

const TopBar: React.FC<TopBarProps> = ({ jobsOpen, onToggleJobs }) => {
  const location = useLocation()
  const { activeCount } = useJobs()
  const { tools } = useToolbar()
  const { user, signOut } = useAuth()
  const [agentsOpen, setAgentsOpen] = useState(false)

  return (
    <header className="topbar">
      <nav className="topbar-nav">
        <Link
          to="/"
          className={`topbar-item${
            location.pathname.startsWith('/settings') ? '' : ' active'
          }`}
          title="Home"
          aria-label="Home"
        >
          <HomeIcon size={18} />
        </Link>
        <Link
          to="/settings"
          className={`topbar-item${
            location.pathname.startsWith('/settings') ? ' active' : ''
          }`}
          title="Settings"
          aria-label="Settings"
        >
          <GearIcon size={18} />
        </Link>
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
            {/* the raw feed, which used to be a column of its own */}
            <LatestMenu
              articles={tools.feed}
              total={tools.feedTotal}
              onLoadMore={tools.onLoadMoreFeed}
              loadingMore={tools.loadingMoreFeed}
              hasSources={tools.sources.length > 0}
              uncategorized={tools.uncategorized}
              running={tools.agentRunning}
              onRunAgent={tools.onRunAgent}
              extracting={tools.extracting}
              onExtract={tools.onExtract}
              onOpenContent={tools.onOpenArticle}
            />
            <SourcesMenu
              sources={tools.sources}
              refreshing={tools.refreshingSources}
              errors={tools.sourceErrors}
              isRefreshingAll={tools.isRefreshing}
              onRefresh={tools.onRefreshSource}
              onRemove={tools.onRemoveSource}
              onAdd={tools.onAddSource}
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
              prompt={tools.prompt}
              onSavePrompt={tools.onSavePrompt}
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

        <button
          className="topbar-item"
          onClick={signOut}
          title={`Sign out (${user?.email ?? ''})`}
          aria-label="Sign out"
        >
          <SignOutIcon size={16} />
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
