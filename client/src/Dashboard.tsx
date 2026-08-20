import * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'slim-react-router'
import api, {
  type Dashboard as Arc,
  type Fact,
  type FeedArticle,
  type NewSource,
  type Prediction,
  type Source,
  type StoryFeedEntry,
} from './api'
import { useJobs } from './contexts/JobsContext'
import { useToolbar } from './contexts/ToolbarContext'
import AddSourceModal from './AddSourceModal'
import ArticleContentModal from './ArticleContentModal'
import Chat from './Chat'
import Facts from './Facts'
import Predictions from './Predictions'
import Stories from './Stories'

type Loaded = {
  dashboard: Arc
  sources: Source[]
  feed: FeedArticle[]
  stories: StoryFeedEntry[]
  facts: Fact[]
  /** Which revision of the facts the page is looking at; 0 when there is none. */
  factsVersion: number
  predictions: Prediction[]
  uncategorized: number
}

/** How often a page left open re-reads itself, for changes made elsewhere. */
const REFRESH_MS = 20_000

/**
 * One arc, on its own page: the stories it is made of down the left, what it
 * has established and what that points to in the middle, and an agent to talk
 * to about it on the right.
 *
 * The dashboard *is* the arc — it owns its stories, facts, predictions and
 * conversations. What it does not own is the sources feeding it: those are
 * independent, assigned to it, and shared with whatever other arcs read the
 * same outlet.
 */
const Dashboard: React.FC = () => {
  const { id: routeId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dashboardId = routeId || 'default'
  // useNavigate hands back a fresh function every render; pinning it in a ref
  // keeps the callbacks below stable, so the toolbar effect doesn't re-fire
  // (setTools -> re-render -> new navigate -> setTools -> ...) forever.
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const goToDashboard = useCallback((id: string) => {
    navigateRef.current(`/db/${id}`)
  }, [])

  const [dashboards, setDashboards] = useState<Arc[]>([])
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAddSource, setShowAddSource] = useState(false)
  // the article whose stored text is on screen, if any
  const [openArticle, setOpenArticle] = useState<number | null>(null)
  const [sourceErrors, setSourceErrors] = useState<Map<string, string>>(
    new Map(),
  )
  const { jobs, refresh: refreshJobs, onJobFinished } = useJobs()
  const { setTools } = useToolbar()

  const load = useCallback(() => {
    return api
      .getDashboard(dashboardId)
      .then((data: Loaded) => {
        setLoaded(data)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [dashboardId])

  const loadDashboards = useCallback(() => {
    api
      .listDashboards()
      .then((data: { dashboards: Arc[] }) =>
        setDashboards(data.dashboards || []),
      )
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    loadDashboards()
  }, [loadDashboards])

  useEffect(() => {
    setLoaded(null)
    setError(null)
    load()
  }, [load])

  /**
   * A quiet re-read for changes this page did not make: a fact added in
   * another tab, or an agent run that refiled a story. The chat reports its own
   * turns the moment they end, so this only has to be slow enough not to matter
   * and fast enough that a page left open is not wrong for long.
   *
   * Paused while the tab is hidden — nobody is looking, and it would keep a
   * backgrounded tab polling all night.
   */
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') load()
    }
    const timer = setInterval(tick, REFRESH_MS)
    document.addEventListener('visibilitychange', tick)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [load])

  const sources = loaded?.sources ?? []
  const sourceIds = new Set(sources.map((s) => s.id))

  // a source is "refreshing" while it has a job in flight. Jobs are not scoped
  // to a dashboard any more — a fetch serves every arc reading that source —
  // so the test is whether this dashboard reads it.
  const refreshing = new Set(
    jobs
      .filter(
        (job) =>
          (job.status === 'queued' || job.status === 'running') &&
          job.payload.sourceId &&
          sourceIds.has(job.payload.sourceId),
      )
      .map((job) => job.payload.sourceId as string),
  )

  // an article is "extracting" while its content job is in flight
  const extracting = new Set(
    jobs
      .filter(
        (job) =>
          job.type === 'extract_content' &&
          (job.status === 'queued' || job.status === 'running') &&
          job.payload.articleId,
      )
      .map((job) => job.payload.articleId as number),
  )

  const clearError = useCallback((id: string) => {
    setSourceErrors((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  /** Queues the work; the worker does it and the jobs poll reports back. */
  const refreshSource = useCallback(
    (id: string) => {
      clearError(id)
      api
        .refreshSource(id)
        .then(() => refreshJobs())
        .catch((err: Error) => {
          setSourceErrors((prev) => new Map(prev).set(id, err.message))
        })
    },
    [refreshJobs, clearError],
  )

  const refreshAll = useCallback(() => {
    sources.forEach((source) => refreshSource(source.id))
    // `sources` is derived from `loaded` every render; the id list covers it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources.map((s) => s.id).join(','), refreshSource])

  /** Adds a source to this arc: a new one, or one another arc already reads. */
  const addSource = useCallback(
    (source: NewSource | { sourceId: string }) =>
      api
        .assignSource(dashboardId, source)
        .then((data: { sources: Source[] }) => {
          setLoaded((prev) =>
            prev ? { ...prev, sources: data.sources } : prev,
          )
          const id = 'sourceId' in source ? source.sourceId : source.name
          refreshSource(id)
        }),
    [dashboardId, refreshSource],
  )

  /**
   * Stops this arc reading a source. The source and its articles stay — other
   * arcs may be reading them — so this only narrows what lands in the feed.
   */
  const removeSource = useCallback(
    (id: string) => {
      if (!window.confirm(`Stop reading "${id}" in this dashboard?`)) return
      api.unassignSource(dashboardId, id).then(() => {
        clearError(id)
        load()
      })
    },
    [dashboardId, clearError, load],
  )

  /** Queues a read of one article's page; the jobs poll reports it back. */
  const extractContent = useCallback(
    (articleId: number) => {
      api
        .extractArticleContent(dashboardId, articleId)
        .then(() => refreshJobs())
        .catch(() => undefined)
    },
    [dashboardId, refreshJobs],
  )

  /** Queues a categorizing run over whatever this arc has not filed yet. */
  const runAgent = useCallback(() => {
    api
      .runAgent(dashboardId, 'categorizing_agent')
      .then(() => refreshJobs())
      .catch(() => undefined)
  }, [dashboardId, refreshJobs])

  /** Queues a read of the filed stories, to bring the facts up to date. */
  const runFacts = useCallback(() => {
    api
      .runAgent(dashboardId, 'facts_agent')
      .then(() => refreshJobs())
      .catch(() => undefined)
  }, [dashboardId, refreshJobs])

  const factsRunning = jobs.some(
    (job) =>
      job.type === 'run_facts' &&
      (job.status === 'queued' || job.status === 'running') &&
      job.payload.dashboardId === dashboardId,
  )

  const agentRunning = jobs.some(
    (job) =>
      job.type === 'run_agent' &&
      (job.status === 'queued' || job.status === 'running') &&
      job.payload.dashboardId === dashboardId,
  )

  // a finished fetch or run is what changes the page under it
  useEffect(() => {
    return onJobFinished((job) => {
      // a facts run rewrites the list the pane beside it is showing, so it
      // reloads on the same terms as a categorizing run does
      if (job.type === 'run_agent' || job.type === 'run_facts') {
        if (
          job.payload.dashboardId === dashboardId &&
          job.status === 'succeeded'
        ) {
          load()
        }
        return
      }

      if (job.type === 'extract_content') {
        if (job.status === 'succeeded') load()
        return
      }

      const sourceId = job.payload.sourceId
      if (!sourceId || !sourceIds.has(sourceId)) return

      if (job.status === 'failed') {
        setSourceErrors((prev) =>
          new Map(prev).set(sourceId, job.error || `${job.type} failed`),
        )
        return
      }

      if (job.type !== 'extract_articles' && job.type !== 'fetch_feed') return
      clearError(sourceId)
      load()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardId, onJobFinished, load, clearError, [...sourceIds].join(',')])

  const createDashboard = useCallback(
    (name: string) => {
      api.createDashboard(name).then((res: { dashboard?: Arc }) => {
        if (res.dashboard) {
          loadDashboards()
          goToDashboard(res.dashboard.id)
        }
      })
    },
    [loadDashboards, goToDashboard],
  )

  const deleteDashboard = useCallback(
    (id: string) => {
      if (!window.confirm(`Delete dashboard "${id}" and everything in it?`)) {
        return
      }
      api.deleteDashboard(id).then(() => {
        loadDashboards()
        if (dashboardId === id) goToDashboard('default')
      })
    },
    [dashboardId, loadDashboards, goToDashboard],
  )

  /** Only the name moves — the id is the url, so the page stays where it is. */
  const renameDashboard = useCallback(
    (id: string, name: string) => {
      api.renameDashboard(id, name).then(() => {
        loadDashboards()
        if (dashboardId === id) load()
      })
    },
    [dashboardId, loadDashboards, load],
  )

  const renameStory = useCallback(
    (storyId: number, title: string) => {
      api
        .renameStory(dashboardId, storyId, title)
        .then((data: { stories: StoryFeedEntry[] }) => {
          setLoaded((prev) =>
            prev ? { ...prev, stories: data.stories } : prev,
          )
        })
        .catch(() => undefined)
    },
    [dashboardId],
  )

  const deleteStory = useCallback(
    (storyId: number) => {
      if (
        !window.confirm('Unfile this story? Its articles go back in the queue.')
      )
        return
      api
        .deleteStory(dashboardId, storyId)
        .then(() => load())
        .catch(() => undefined)
    },
    [dashboardId, load],
  )

  // the arc's controls, its sources and its latest headlines are all rendered
  // by the top bar
  const isRefreshing = refreshing.size > 0
  const feed = loaded?.feed ?? []
  const uncategorized = loaded?.uncategorized ?? 0
  useEffect(() => {
    setTools({
      dashboards,
      current: dashboardId,
      currentName: loaded?.dashboard.name ?? dashboardId,
      onSelect: goToDashboard,
      onCreate: createDashboard,
      onDelete: deleteDashboard,
      onRename: renameDashboard,
      sources,
      refreshingSources: refreshing,
      sourceErrors,
      isRefreshing,
      onRefreshSource: refreshSource,
      onRemoveSource: removeSource,
      onAddSource: () => setShowAddSource(true),
      onRefreshAll: refreshAll,
      feed,
      uncategorized,
      agentRunning,
      onRunAgent: runAgent,
      onExtract: extractContent,
      onOpenArticle: setOpenArticle,
      extracting,
    })
    // `refreshing` and `extracting` are rebuilt every render; the flags and the
    // jobs list they derive from cover their changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    setTools,
    dashboards,
    dashboardId,
    loaded,
    goToDashboard,
    createDashboard,
    deleteDashboard,
    renameDashboard,
    refreshSource,
    removeSource,
    refreshAll,
    runAgent,
    extractContent,
    isRefreshing,
    sourceErrors,
    agentRunning,
    jobs,
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
        const idx = dashboards.findIndex((d) => d.id === dashboardId)
        if (idx === -1) return
        const delta = e.key === 'ArrowLeft' ? -1 : 1
        const next = (idx + delta + dashboards.length) % dashboards.length
        e.preventDefault()
        goToDashboard(dashboards[next]!.id)
      } else if (e.code === 'KeyR') {
        e.preventDefault()
        refreshAll()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dashboards, dashboardId, goToDashboard, refreshAll])

  if (error) {
    return (
      <div className="arc">
        <p className="arc-error">{error}</p>
      </div>
    )
  }

  if (!loaded) return null

  const { dashboard, stories } = loaded

  return (
    <div className="arc">
      <aside className="arc-stories">
        <Stories
          stories={stories}
          hasSources={sources.length > 0}
          hasArticles={feed.length > 0}
          extracting={extracting}
          onExtract={extractContent}
          onOpenContent={setOpenArticle}
          onRename={renameStory}
          onDelete={deleteStory}
          onRunFacts={runFacts}
          runningFacts={factsRunning}
        />
      </aside>

      {/* facts before predictions, the way they are derived: what the arc has
          established, then what that implies about what happens next */}
      <aside className="arc-facts">
        <Facts
          dashboardId={dashboardId}
          facts={loaded.facts ?? []}
          version={loaded.factsVersion ?? 0}
          onChanged={load}
        />
      </aside>

      <section className="arc-predictions">
        <Predictions
          dashboardId={dashboardId}
          predictions={loaded.predictions ?? []}
          onChanged={load}
        />
      </section>

      <aside className="arc-chat">
        <Chat
          dashboardId={dashboardId}
          dashboardName={dashboard.name}
          onChanged={load}
        />
      </aside>

      <AddSourceModal
        isOpen={showAddSource}
        assigned={sources}
        onClose={() => setShowAddSource(false)}
        onAdd={addSource}
      />
      <ArticleContentModal
        dashboardId={dashboardId}
        articleId={openArticle}
        onClose={() => setOpenArticle(null)}
      />
    </div>
  )
}

export default Dashboard
