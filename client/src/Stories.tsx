import { PlayIcon, SyncIcon } from '@primer/octicons-react'
import { useCallback, useState } from 'react'
import { type StoryFeedEntry } from './api'
import ArticleRow from './ui/ArticleRow'
import PanelActions from './ui/PanelActions'

type Props = {
  stories: StoryFeedEntry[]
  /**
   * How many stories this dashboard holds, which is not how many are on
   * screen: the page asks for the newest hundred. The foot of the list says so
   * when it is capped, rather than looking like the whole arc.
   */
  total: number
  /** Whether this dashboard reads any source at all — for the empty state. */
  hasSources: boolean
  hasArticles: boolean
  /** Articles with an extract_content job in flight right now. */
  extracting: Set<number>
  onExtract: (articleId: number) => void
  onOpenContent: (articleId: number) => void
  /** Queues the facts agent over these stories. */
  onRunFacts: () => void
  /** Whether that run is in flight right now. */
  runningFacts: boolean
  /** The tab bar's action slot, and whether this is the open tab. */
  actionsSlot: HTMLElement | null
  active: boolean
}

/**
 * The arc, as events: one entry per story, newest first by its newest article,
 * with the articles that make it up under each.
 *
 * There is no storyline label any more — the dashboard is the arc, so every
 * story on this page already belongs to it.
 */
const Stories = ({
  stories,
  total,
  hasSources,
  hasArticles,
  extracting,
  onExtract,
  onOpenContent,
  onRunFacts,
  runningFacts,
  actionsSlot,
  active,
}: Props) => {
  // the stories folded shut, by id. Kept while the page is open, so the
  // list re-reading itself every few seconds leaves them as they were
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set())
  const toggle = useCallback((id: number) => {
    setCollapsed((was) => {
      const next = new Set(was)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }, [])

  // the panel's action, lent to the tab bar while this tab is open
  const head = (
    <PanelActions slot={actionsSlot} active={active}>
      <button
        className={`col-run${runningFacts ? ' is-busy' : ''}`}
        onClick={onRunFacts}
        disabled={runningFacts || stories.length === 0}
        title={
          stories.length === 0
            ? 'Nothing filed to read yet'
            : runningFacts
              ? 'Reading the stories…'
              : 'Read these stories and update the facts'
        }
      >
        {runningFacts ? (
          <SyncIcon size={12} className="col-run-spin" />
        ) : (
          <PlayIcon size={12} />
        )}
        {runningFacts ? 'Updating facts' : 'Update facts'}
      </button>
    </PanelActions>
  )

  if (stories.length === 0) {
    return (
      <div className="stories">
        {head}
        <div className="col-body">
          <p className="stories-placeholder">
            {emptyState(hasSources, hasArticles)}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="stories">
      {head}
      <div className="col-body stories-list">
        {stories.map((story) => {
          const isCollapsed = collapsed.has(story.id)
          const bodyId = `story-${story.id}-articles`
          return (
            <article
              key={story.id}
              className={`story${isCollapsed ? ' is-collapsed' : ''}`}
            >
              <h2 className="story-title">
                {/* the whole label is the switch: a click folds the story's
                    articles away under it, and another brings them back */}
                <button
                  type="button"
                  className="story-toggle"
                  onClick={() => toggle(story.id)}
                  aria-expanded={!isCollapsed}
                  aria-controls={bodyId}
                >
                  {/* one line, cut with an ellipsis; the whole of it is in
                      the tooltip for the titles that do not fit */}
                  <span className="story-title-text" title={story.title}>
                    {story.title}
                  </span>
                  {/* folded, the label says how much is under it */}
                  <span className="story-title-count" aria-hidden={!isCollapsed}>
                    {story.articles.length}
                  </span>
                </button>
              </h2>
              {/* a grid row that eases between its content's height and
                  nothing, so the fold animates without measuring anything.
                  Folded, what is inside can't be tabbed into */}
              <div
                className="story-body"
                id={bodyId}
                {...({ inert: isCollapsed } as Record<string, unknown>)}
              >
                <div className="story-articles">
                  {story.articles.map((article) => (
                    <ArticleRow
                      key={article.id}
                      article={article}
                      busy={extracting.has(article.id)}
                      onExtract={onExtract}
                      onOpen={onOpenContent}
                      showImportance
                    />
                  ))}
                </div>
              </div>
            </article>
          )
        })}
        {/* the page asks for the newest hundred; a capped list says so at
            its foot, where running out is noticed */}
        {total > stories.length && (
          <p className="list-foot">
            Showing the newest {stories.length} of {total} stories
          </p>
        )}
      </div>
    </div>
  )
}

/** Which of the three ways this arc can be empty the reader is looking at. */
function emptyState(hasSources: boolean, hasArticles: boolean): string {
  if (!hasSources) {
    return 'No sources yet. Assign one from the top bar to start collecting articles.'
  }
  if (!hasArticles) return 'No articles yet — hit refresh on a source.'
  return 'Nothing filed under this dashboard yet — run the categorizing agent.'
}

export default Stories
