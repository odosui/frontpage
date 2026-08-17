import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'slim-react-router'
import api, {
  type Fact,
  type Prediction,
  type Storyline as Arc,
  type StoryFeedEntry,
} from './api'
import ArticleContentModal from './ArticleContentModal'
import Stories from './Stories'
import StorylineChat from './StorylineChat'
import StorylineFacts from './StorylineFacts'
import StorylinePredictions from './StorylinePredictions'
import { useJobs } from './contexts/JobsContext'

type Loaded = {
  storyline: Arc
  stories: StoryFeedEntry[]
  facts: Fact[]
  /** Which revision of the facts the page is looking at; 0 when there is none. */
  factsVersion: number
  predictions: Prediction[]
}

/** How often a page left open re-reads itself, for changes made elsewhere. */
const REFRESH_MS = 20_000

/**
 * One arc, on its own page: the stories it is made of down the left — the same
 * list the dashboard shows, narrowed to this arc — the middle left for what
 * comes next, and an agent to talk to about it on the right.
 */
const Storyline: React.FC = () => {
  const { id: routeId, slug = '' } = useParams<{ id: string; slug: string }>()
  const dashboardId = routeId || 'default'
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  // the article whose stored text is on screen, if any
  const [openArticle, setOpenArticle] = useState<number | null>(null)
  const { jobs, refresh: refreshJobs, onJobFinished } = useJobs()

  const load = useCallback(() => {
    return api
      .getStoryline(dashboardId, slug)
      .then((data: Loaded) => {
        setLoaded(data)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [dashboardId, slug])

  useEffect(() => {
    setLoaded(null)
    setError(null)
    load()
  }, [load])

  /**
   * A quiet re-read for changes this page did not make: a fact added in another
   * tab, or an agent run that refiled a story. The chat reports its own turns
   * the moment they end, so this only has to be slow enough not to matter and
   * fast enough that a page left open is not wrong for long.
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

  // an article is "extracting" while its content job is in flight
  const extracting = new Set(
    jobs
      .filter(
        (job) =>
          job.type === 'extract_content' &&
          (job.status === 'queued' || job.status === 'running') &&
          job.payload.dashboardId === dashboardId &&
          job.payload.articleId,
      )
      .map((job) => job.payload.articleId as number),
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

  // the text landing is what flips a row's button, so the list has to come back
  useEffect(() => {
    return onJobFinished((job) => {
      if (job.payload.dashboardId !== dashboardId) return
      if (job.status !== 'succeeded') return
      if (job.type !== 'extract_content' && job.type !== 'run_agent') return
      load()
    })
  }, [dashboardId, onJobFinished, load])

  if (error) {
    return (
      <div className="storyline">
        <p className="storyline-error">
          {error}
          <Link className="storyline-back" to={backTo(routeId)}>
            Back to the dashboard
          </Link>
        </p>
      </div>
    )
  }

  if (!loaded) return null

  const { storyline, stories } = loaded

  return (
    <div className="storyline">
      <aside className="storyline-stories">
        <div className="storyline-head">
          <Link className="storyline-back" to={backTo(routeId)}>
            ← Dashboard
          </Link>
          <h1 className="storyline-title">{storyline.title}</h1>
        </div>

        {/* Stories' own empty state is about the dashboard being empty, which
            is the wrong thing to say about one quiet arc */}
        {stories.length === 0 ? (
          <p className="storyline-placeholder">
            Nothing filed under this storyline yet.
          </p>
        ) : (
          <Stories
            stories={stories}
            hasArticles
            extracting={extracting}
            onExtract={extractContent}
            onOpenContent={setOpenArticle}
          />
        )}
      </aside>

      {/* facts before predictions, the way they are derived: what the arc has
          established, then what that implies about what happens next */}
      <aside className="storyline-facts">
        <StorylineFacts
          dashboardId={dashboardId}
          storyline={storyline.slug}
          facts={loaded.facts ?? []}
          version={loaded.factsVersion ?? 0}
          onChanged={load}
        />
      </aside>

      <section className="storyline-predictions">
        <StorylinePredictions
          dashboardId={dashboardId}
          storyline={storyline.slug}
          predictions={loaded.predictions ?? []}
          onChanged={load}
        />
      </section>

      <aside className="storyline-chat">
        <StorylineChat
          dashboardId={dashboardId}
          storyline={storyline.slug}
          onChanged={load}
        />
      </aside>

      <ArticleContentModal
        dashboardId={dashboardId}
        articleId={openArticle}
        onClose={() => setOpenArticle(null)}
      />
    </div>
  )
}

/** The dashboard this arc belongs to, back at its own url. */
function backTo(routeId: string | undefined): string {
  return routeId ? `/db/${routeId}` : '/'
}

export default Storyline
