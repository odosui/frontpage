import { useEffect, useRef, useState } from 'react'

/** How far, after resistance, a pull has to travel before letting go refreshes. */
export const PULL_THRESHOLD = 64
/** The furthest the list follows the finger. */
const PULL_MAX = 96
/** Where the list rests while the refresh it started is running. */
const PULL_HELD = 48
/** The spinner stays at least this long, so a fast refresh still reads as one. */
const MIN_HOLD_MS = 600

/**
 * Pull-to-refresh on a scroller, for touch screens. Dragging down from the top
 * of the list pulls it down after the finger, at half speed; letting go past
 * the threshold calls `onRefresh`, and the list then rests slightly open, with
 * the spinner showing, until `busy` goes false.
 *
 * Touch events only: a mouse and a trackpad never see any of this. Anywhere
 * but the very top, or pulling upwards, the scroller scrolls as normal.
 *
 * Returns a callback ref for the scroller, how far it is pulled, whether the
 * finger is still down (no transition then: the list must follow it exactly),
 * whether letting go now would refresh, and whether a refresh is showing.
 */
export function usePullToRefresh(
  onRefresh: () => void,
  busy: boolean,
  enabled = true,
) {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [pull, setPull] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [held, setHeld] = useState(false)
  const [minDone, setMinDone] = useState(true)

  // read through a ref so the listeners are not torn down every render
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  useEffect(() => {
    if (!el || !enabled) return
    let startY: number | null = null
    let current = 0

    const reset = () => {
      current = 0
      setPull(0)
      setDragging(false)
    }

    const start = (e: TouchEvent) => {
      startY =
        e.touches.length === 1 && el.scrollTop <= 0
          ? e.touches[0].clientY
          : null
    }

    const move = (e: TouchEvent) => {
      if (startY === null) return
      const dy = e.touches[0].clientY - startY
      if (dy <= 0 || el.scrollTop > 0) {
        if (current) reset()
        return
      }
      // the pull is ours: no rubber-banding, no page refresh by the browser
      e.preventDefault()
      current = Math.min(PULL_MAX, dy / 2)
      setDragging(true)
      setPull(current)
    }

    const end = () => {
      if (startY === null) return
      startY = null
      if (current >= PULL_THRESHOLD) {
        setHeld(true)
        setMinDone(false)
        window.setTimeout(() => setMinDone(true), MIN_HOLD_MS)
        onRefreshRef.current()
      }
      reset()
    }

    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [el, enabled])

  // the refresh is over once the minimum has passed and nothing is running
  useEffect(() => {
    if (held && minDone && !busy) setHeld(false)
  }, [held, minDone, busy])

  return {
    ref: setEl,
    offset: dragging ? pull : held ? PULL_HELD : 0,
    dragging,
    armed: pull >= PULL_THRESHOLD,
    refreshing: held,
    progress: Math.min(1, pull / PULL_THRESHOLD),
  }
}
