import { AnimatePresence, motion } from 'motion/react'
import React, { memo, useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ClickOutside from './ClickOutside'

type Props = {
  open: boolean
  onClose: () => void
  /**
   * The control the menu hangs off. It is measured rather than positioned
   * against, because the panel is rendered at the end of the body: a menu
   * absolutely positioned inside the stories column was clipped by that
   * column's own scrollbox, which is what cut "Rename…" in half.
   */
  anchor: React.RefObject<HTMLElement | null>
  children: React.ReactNode
}

/** Breathing room between the control and the panel, and from the edges. */
const GAP = 4
const MARGIN = 8

const DropdownMenu = ({ open, onClose, anchor, children }: Props) => {
  const panel = useRef<HTMLDivElement | null>(null)
  const [at, setAt] = useState<{ top: number; left: number } | null>(null)

  const handleClose = useCallback(() => {
    if (open) {
      onClose()
    }
  }, [open, onClose])

  /**
   * Placed once the panel is in the dom, since where it goes depends on how
   * big it is: it hangs off the control's left edge and drops below it, and
   * moves only where that would put it off screen.
   */
  useLayoutEffect(() => {
    if (!open) {
      setAt(null)
      return
    }

    const control = anchor.current?.getBoundingClientRect()
    const box = panel.current?.getBoundingClientRect()
    if (!control || !box) return

    const left = Math.max(
      MARGIN,
      Math.min(control.left, window.innerWidth - box.width - MARGIN),
    )
    const below = control.bottom + GAP
    // above the control instead when there is no room under it
    const top =
      below + box.height + MARGIN <= window.innerHeight
        ? below
        : Math.max(MARGIN, control.top - GAP - box.height)

    setAt({ top, left })
  }, [open, anchor])

  /**
   * A panel fixed to the viewport does not travel with what it is anchored to,
   * so a scroll would leave it pointing at nothing. It closes instead, which
   * is what every menu that behaves this way does. Capturing, because the
   * scroll happens in the stories column rather than on the window.
   */
  useLayoutEffect(() => {
    if (!open) return
    window.addEventListener('scroll', handleClose, true)
    window.addEventListener('resize', handleClose)
    return () => {
      window.removeEventListener('scroll', handleClose, true)
      window.removeEventListener('resize', handleClose)
    }
  }, [open, handleClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <ClickOutside onClickOutside={handleClose}>
          <motion.div
            ref={panel}
            className="dropdown-menu"
            // hidden for the one frame between mounting and being measured,
            // so it is never seen in the corner it was rendered in
            style={{
              top: at?.top ?? 0,
              left: at?.left ?? 0,
              visibility: at ? 'visible' : 'hidden',
            }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {children}
          </motion.div>
        </ClickOutside>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export default memo(DropdownMenu)
