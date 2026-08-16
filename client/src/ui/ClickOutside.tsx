import React, { memo, useCallback, useEffect, useRef } from 'react'

type Props = {
  children: React.ReactNode
  onClickOutside: () => void
}

const ClickOutside = ({ children, onClickOutside }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null)

  const handleClick = useCallback(
    (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClickOutside()
      }
    },
    [onClickOutside],
  )

  useEffect(() => {
    /**
     * Listening on the next frame rather than now: this mounts inside the very
     * click that opened it, and that click is still on its way up to document.
     * Registering here would catch it — the target being the toggle, which is
     * outside this element — and close what was just opened.
     */
    const armed = requestAnimationFrame(() => {
      document.addEventListener('click', handleClick)
    })

    return () => {
      cancelAnimationFrame(armed)
      document.removeEventListener('click', handleClick)
    }
    // the previous version left this empty, which pinned the listener to the
    // first render's callback
  }, [handleClick])

  return <div ref={ref}>{children}</div>
}

export default memo(ClickOutside)
