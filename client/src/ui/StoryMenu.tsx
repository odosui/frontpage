import { useRef, useState } from 'react'
import DropdownMenu from './DropdownMenu'

type Props = {
  title: string
  onRename?: ((title: string) => void) | undefined
  onDelete?: (() => void) | undefined
}

/**
 * What can be done to one story. Moving it between arcs used to live here;
 * that went away with storylines — a story belongs to the dashboard it was
 * filed in, so what is left is fixing a bad title and unfiling a bad story.
 *
 * Hidden until the story is hovered: both are deliberate acts, and a caret on
 * every card would be a row of them down the page.
 */
const StoryMenu = ({ title, onRename, onDelete }: Props) => {
  const [open, setOpen] = useState(false)
  // the menu is rendered at the end of the body, so it is placed against this
  // rather than nested under it
  const toggle = useRef<HTMLButtonElement>(null)

  const rename = () => {
    setOpen(false)
    const next = window.prompt('Rename this story:', title)?.trim()
    if (next && next !== title) onRename?.(next)
  }

  return (
    <div className="story-menu">
      <button
        ref={toggle}
        className="story-menu-toggle"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-label={`Actions for ${title}`}
        title="Story actions"
      >
        <span className="story-menu-caret" />
      </button>

      <DropdownMenu
        open={open}
        onClose={() => setOpen(false)}
        anchor={toggle}
      >
        <div className="story-menu-list">
          {onRename && (
            <button className="story-menu-item" onClick={rename}>
              Rename…
            </button>
          )}
          {onDelete && (
            <>
              <div className="story-menu-divider" />
              <button
                className="story-menu-item story-menu-item--danger"
                onClick={() => {
                  setOpen(false)
                  onDelete()
                }}
              >
                Unfile this story
              </button>
            </>
          )}
        </div>
      </DropdownMenu>
    </div>
  )
}

export default StoryMenu
