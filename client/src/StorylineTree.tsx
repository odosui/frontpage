import { type StoryFeedEntry } from './api'

/** What the tree has selected; null means "show everything". */
export type Selection =
  | { kind: 'storyline'; id: number }
  | { kind: 'story'; id: number }
  | null

type Props = {
  stories: StoryFeedEntry[]
  selection: Selection
  onSelect: (selection: Selection) => void
}

type Branch = {
  /** The storyline's id, or null for the stories that belong to no arc. */
  id: number | null
  title: string
  stories: StoryFeedEntry[]
}

/**
 * Storyline → story, as a tree. The feed is a flat list ordered by recency and
 * the same storyline can head several entries; this regroups it so each arc
 * appears once, with everything filed under it.
 */
const StorylineTree = ({ stories, selection, onSelect }: Props) => {
  const branches = group(stories)
  if (branches.length === 0) return null

  return (
    <nav className="tree" aria-label="Storylines">
      <button
        className={`tree-all${selection === null ? ' is-active' : ''}`}
        onClick={() => onSelect(null)}
      >
        All stories
      </button>

      <ul className="tree-list">
        {branches.map((branch) => (
          <li key={branch.id ?? 'standalone'}>
            <button
              className={`tree-storyline${
                selection?.kind === 'storyline' && selection.id === branch.id
                  ? ' is-active'
                  : ''
              }`}
              onClick={() =>
                onSelect(
                  branch.id === null ? null : { kind: 'storyline', id: branch.id },
                )
              }
            >
              {branch.title}
            </button>

            <ul className="tree-stories">
              {branch.stories.map((story) => (
                <li key={story.id}>
                  <button
                    className={`tree-story${
                      selection?.kind === 'story' && selection.id === story.id
                        ? ' is-active'
                        : ''
                    }`}
                    onClick={() => onSelect({ kind: 'story', id: story.id })}
                    title={story.title}
                  >
                    {story.title}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Biggest arcs first; the storyline-less stories always sit last. */
function group(stories: StoryFeedEntry[]): Branch[] {
  const branches = new Map<number | null, Branch>()

  for (const story of stories) {
    const id = story.storyline?.id ?? null
    const existing = branches.get(id)
    if (existing) {
      existing.stories.push(story)
    } else {
      branches.set(id, {
        id,
        title: story.storyline?.title ?? 'Standalone',
        stories: [story],
      })
    }
  }

  return [...branches.values()].sort((a, b) => {
    if (a.id === null) return 1
    if (b.id === null) return -1
    return b.stories.length - a.stories.length || a.title.localeCompare(b.title)
  })
}

export default StorylineTree
