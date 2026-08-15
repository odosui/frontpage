import * as React from 'react'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'slim-react-router'
import api, {
  type Channel,
  type FeedArticle,
  type StoryFeedEntry,
} from './api'
import { useJobs } from './contexts/JobsContext'
import { useToolbar } from './contexts/ToolbarContext'
import AddChannelModal from './AddChannelModal'
import Feed from './Feed'
import Stories from './Stories'
import StorylineTree, { type Selection } from './StorylineTree'

const Dashboard: React.FC = () => {
  const { id: routeId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dashboardId = routeId || 'default'
  // useNavigate hands back a fresh function every render; pinning it in a ref
  // keeps the callbacks below stable, so the toolbar effect doesn't re-fire
  // (setTools -> re-render -> new navigate -> setTools -> ...) forever.
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const setDashboardId = useCallback((id: string) => {
    navigateRef.current(`/db/${id}`)
  }, [])
  const [dashboards, setDashboards] = useState<string[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [feed, setFeed] = useState<FeedArticle[]>([])
  const [stories, setStories] = useState<StoryFeedEntry[]>([])
  const [selection, setSelection] = useState<Selection>(null)
  const [loaded, setLoaded] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [errors, setErrors] = useState<Map<string, string>>(new Map())
  const { jobs, refresh: refreshJobs, onJobFinished } = useJobs()
  const { setTools } = useToolbar()

  // a channel is "refreshing" while it has a job in flight
  const refreshing = new Set(
    jobs
      .filter(
        (job) =>
          (job.status === 'queued' || job.status === 'running') &&
          job.payload.dashboardId === dashboardId &&
          job.payload.channelId,
      )
      .map((job) => job.payload.channelId as string),
  )

  const loadDashboards = useCallback(() => {
    api.listDashboards().then((data: { dashboards: string[] }) => {
      setDashboards(data.dashboards || [])
    })
  }, [])

  useEffect(() => {
    loadDashboards()
  }, [loadDashboards])

  useEffect(() => {
    setLoaded(false)
    api
      .getDashboard(dashboardId)
      .then(
        (data: {
          channels: Channel[]
          feed: FeedArticle[]
          stories: StoryFeedEntry[]
        }) => {
          setChannels(data.channels || [])
          setFeed(data.feed || [])
          setStories(data.stories || [])
          setLoaded(true)
        },
      )
  }, [dashboardId])

  const reloadFeed = useCallback(() => {
    api
      .getFeed(dashboardId)
      .then((data: { feed: FeedArticle[] }) => setFeed(data.feed || []))
      .catch(() => undefined)
  }, [dashboardId])

  const reloadStories = useCallback(() => {
    api
      .getStories(dashboardId)
      .then((data: { stories: StoryFeedEntry[] }) =>
        setStories(data.stories || []),
      )
      .catch(() => undefined)
  }, [dashboardId])

  const clearError = useCallback((id: string) => {
    setErrors((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const deleteChannel = useCallback(
    (id: string) => {
      if (!window.confirm(`Delete channel "${id}" and its articles?`)) return
      api.deleteChannel(dashboardId, id).then(() => {
        setChannels((prev) => prev.filter((c) => c.id !== id))
        setFeed((prev) => prev.filter((a) => a.channelId !== id))
        clearError(id)
        // its articles went with it, so stories may have lost entries
        reloadStories()
      })
    },
    [dashboardId, clearError, reloadStories],
  )

  /** Queues the work; the worker does it and the jobs poll reports back. */
  const refreshChannel = useCallback(
    (id: string) => {
      clearError(id)
      api
        .refreshChannel(dashboardId, id)
        .then(() => refreshJobs())
        .catch((err: Error) => {
          setErrors((prev) => new Map(prev).set(id, err.message))
        })
    },
    [dashboardId, refreshJobs, clearError],
  )

  // pull the feed back in as each channel's analysis lands
  useEffect(() => {
    return onJobFinished((job) => {
      const { dashboardId: jobDashboard, channelId } = job.payload
      if (jobDashboard !== dashboardId) return

      // an agent run is what files articles into stories
      if (job.type === 'run_agent') {
        if (job.status === 'succeeded') reloadStories()
        return
      }

      if (!channelId) return

      if (job.status === 'failed') {
        setErrors((prev) =>
          new Map(prev).set(channelId, job.error || `${job.type} failed`),
        )
        return
      }

      if (job.type !== 'extract_articles') return
      clearError(channelId)
      reloadFeed()
    })
  }, [dashboardId, onJobFinished, reloadFeed, reloadStories, clearError])

  const refreshAll = useCallback(() => {
    channels.forEach((channel) => refreshChannel(channel.id))
  }, [channels, refreshChannel])

  const addChannel = useCallback(
    (channel: Channel) => {
      api.addChannel(dashboardId, channel).then(() => {
        setChannels((prev) => [
          ...prev.filter((c) => c.id !== channel.id),
          channel,
        ])
        refreshChannel(channel.id)
      })
    },
    [dashboardId, refreshChannel],
  )

  const handleCreateDashboard = useCallback(
    (name: string) => {
      api.createDashboard(name).then((res: { id?: string; error?: string }) => {
        if (res.id) {
          loadDashboards()
          setDashboardId(res.id)
        }
      })
    },
    [loadDashboards, setDashboardId],
  )

  const handleDeleteDashboard = useCallback(
    (id: string) => {
      if (!window.confirm(`Delete dashboard "${id}"?`)) return
      api.deleteDashboard(id).then(() => {
        loadDashboards()
        if (dashboardId === id) setDashboardId('default')
      })
    },
    [dashboardId, loadDashboards, setDashboardId],
  )

  const handleRenameDashboard = useCallback(
    (id: string, name: string) => {
      api.renameDashboard(id, name).then((res: { id?: string }) => {
        if (res.id) {
          loadDashboards()
          if (dashboardId === id) setDashboardId(res.id)
        }
      })
    },
    [dashboardId, loadDashboards, setDashboardId],
  )

  // the dashboard's controls are rendered by the top bar
  const isRefreshing = refreshing.size > 0
  useEffect(() => {
    setTools({
      dashboards,
      current: dashboardId,
      onSelect: setDashboardId,
      onCreate: handleCreateDashboard,
      onDelete: handleDeleteDashboard,
      onRename: handleRenameDashboard,
      onRefreshAll: refreshAll,
      isRefreshing,
      onAddChannel: () => setShowAddModal(true),
      channels,
      refreshingChannels: refreshing,
      channelErrors: errors,
      onRefreshChannel: refreshChannel,
      onDeleteChannel: deleteChannel,
    })
    // `refreshing` is rebuilt every render; isRefreshing/jobs cover its changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    setTools,
    dashboards,
    dashboardId,
    setDashboardId,
    handleCreateDashboard,
    handleDeleteDashboard,
    handleRenameDashboard,
    refreshAll,
    isRefreshing,
    channels,
    errors,
    refreshChannel,
    deleteChannel,
  ])

  useEffect(() => () => setTools(null), [setTools])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (dashboards.length < 2) return
        const idx = dashboards.indexOf(dashboardId)
        if (idx === -1) return
        const delta = e.key === 'ArrowLeft' ? -1 : 1
        const next = (idx + delta + dashboards.length) % dashboards.length
        e.preventDefault()
        setDashboardId(dashboards[next]!)
      } else if (e.code === 'KeyR') {
        e.preventDefault()
        refreshAll()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dashboards, dashboardId, setDashboardId, refreshAll])

  // the tree filters the list beside it. A selection that survives a reload
  // but matches nothing would leave the pane blank, so it falls back to all.
  const filtered = stories.filter((story) => {
    if (selection === null) return true
    if (selection.kind === 'story') return story.id === selection.id
    return story.storyline?.id === selection.id
  })
  const visibleStories = filtered.length > 0 ? filtered : stories

  if (!loaded) return null

  return (
    <div className="dashboard">
      <main className="dashboard-main">
        <div className="dashboard-tree">
          <StorylineTree
            stories={stories}
            selection={selection}
            onSelect={setSelection}
          />
        </div>
        <div className="dashboard-stories">
          <Stories stories={visibleStories} hasArticles={feed.length > 0} />
        </div>
      </main>
      <aside className="dashboard-feed">
        <Feed articles={feed} hasChannels={channels.length > 0} />
      </aside>
      <AddChannelModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={addChannel}
      />
    </div>
  )
}

export default Dashboard
