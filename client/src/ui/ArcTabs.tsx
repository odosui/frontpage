import {
  type KeyboardEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

export type ArcTab<Id extends string> = {
  id: Id
  label: string
  /** A small number after the label; nothing is shown for null. */
  count?: number | null
  /** The count is something waiting on the reader, so it is lit. */
  countAlert?: boolean
  /** Spoken after the label, for a count that needs words to mean anything. */
  countLabel?: string
}

type Props<Id extends string> = {
  tabs: ArcTab<Id>[]
  active: Id
  onChange: (id: Id) => void
  /** Prefix for the ids tying each tab to its panel. */
  idPrefix: string
}

/**
 * The arc's sections, as tabs. One underline marks the open one and slides to
 * whichever is picked next, rather than each tab drawing its own: the eye
 * follows a moving mark, where two underlines blinking in and out reads as a
 * flicker.
 *
 * Arrow keys walk the tabs, the way a tablist is expected to behave; Home and
 * End jump to either end.
 */
function ArcTabs<Id extends string>({
  tabs,
  active,
  onChange,
  idPrefix,
}: Props<Id>) {
  const list = useRef<HTMLDivElement | null>(null)
  const buttons = useRef(new Map<Id, HTMLButtonElement>())
  const [mark, setMark] = useState<{ left: number; width: number } | null>(
    null,
  )

  // measured, not computed: the labels are text, and their widths are only
  // known once the font has laid them out. Re-measured whenever anything in
  // the bar changes size — a count growing a digit moves every tab after it
  useLayoutEffect(() => {
    const measure = () => {
      const el = buttons.current.get(active)
      if (el) setMark({ left: el.offsetLeft, width: el.offsetWidth })
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (list.current) observer.observe(list.current)
    buttons.current.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
    // the tabs array is rebuilt on every render of the page; what changes
    // the bar's geometry is only which tabs there are and what they count
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tabs.map((t) => `${t.id}:${t.count}`).join()])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = tabs.findIndex((t) => t.id === active)
    const to =
      event.key === 'ArrowRight'
        ? (at + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (at - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : -1
    if (to === -1) return
    event.preventDefault()
    const next = tabs[to]!.id
    onChange(next)
    buttons.current.get(next)?.focus()
  }

  return (
    <div
      className="arc-tabs"
      role="tablist"
      aria-label="Sections"
      ref={list}
      onKeyDown={onKeyDown}
    >
      {tabs.map((tab) => {
        const selected = tab.id === active
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) buttons.current.set(tab.id, el)
              else buttons.current.delete(tab.id)
            }}
            id={`${idPrefix}-tab-${tab.id}`}
            className={`arc-tab${selected ? ' is-active' : ''}`}
            role="tab"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            // only the open tab is in the tab order; the arrows reach the rest
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
          >
            <span className="arc-tab-label">{tab.label}</span>
            {tab.count != null && (
              <span
                className={`arc-tab-count${tab.countAlert ? ' is-alert' : ''}`}
                aria-label={tab.countLabel}
              >
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
      <span
        className="arc-tabs-mark"
        aria-hidden="true"
        style={
          mark
            ? {
                transform: `translateX(${mark.left}px)`,
                width: mark.width,
              }
            : { opacity: 0 }
        }
      />
    </div>
  )
}

export default ArcTabs
