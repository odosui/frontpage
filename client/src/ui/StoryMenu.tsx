import { useState } from 'react'
import { type Storyline } from '../api'
import DropdownMenu from './DropdownMenu'

type Props = {
  /** The arc it sits under now, so the menu can mark it and skip it. */
  current: Storyline | null
  storylines: Storyline[]
  onMove: (storylineId: number | null) => void
  onCreate: (title: string) => void
}

/**
 * Refiling a story: every arc in the dashboard, plus a new one. Hidden until
 * the story is hovered — moving a story is a deliberate act, and a caret on
 * every card would be a row of them down the page.
 */
const StoryMenu = ({ current, storylines, onMove, onCreate }: Props) => {
  const [open, setOpen] = useState(false)

  const create = () => {
    setOpen(false)
    const title = window.prompt('New storyline for this story:')?.trim()
    if (title) onCreate(title)
  }

  return (
    <div className="story-menu">
      <button
        className="story-menu-toggle"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-label="Move this story to another storyline"
        title="Move to another storyline"
      >
        <span className="story-menu-caret" />
      </button>

      <DropdownMenu open={open} onClose={() => setOpen(false)}>
        <div className="story-menu-list">
          <p className="story-menu-heading">Move to</p>

          {storylines.map((storyline) => (
            <button
              key={storyline.id}
              className={`story-menu-item${
                current?.id === storyline.id ? ' is-current' : ''
              }`}
              disabled={current?.id === storyline.id}
              onClick={() => {
                setOpen(false)
                onMove(storyline.id)
              }}
            >
              {storyline.title}
              <span className="story-menu-count">{storyline.storyCount}</span>
            </button>
          ))}

          <div className="story-menu-divider" />

          <button className="story-menu-item" onClick={create}>
            New storyline…
          </button>

          {current && (
            <button
              className="story-menu-item"
              onClick={() => {
                setOpen(false)
                onMove(null)
              }}
            >
              No storyline
            </button>
          )}
        </div>
      </DropdownMenu>
    </div>
  )
}

export default StoryMenu
