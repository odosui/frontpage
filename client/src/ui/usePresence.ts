import { useEffect, useState } from 'react'

/** Keep in step with `$presence-duration` in styles/vars.scss. */
export const PRESENCE_MS = 200

/**
 * Mounting for an element that fades in and out with a CSS transition.
 *
 * `mounted` stays true through the exit, so the element is still there to
 * transition out. `shown` flips a frame after mounting, so the element is
 * painted once in its hidden state and the transition has somewhere to start.
 */
export function usePresence(open: boolean) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (!open) {
      setShown(false)
      const timer = setTimeout(() => setMounted(false), PRESENCE_MS)
      return () => clearTimeout(timer)
    }

    setMounted(true)
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setShown(true))
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  return { mounted, shown }
}
