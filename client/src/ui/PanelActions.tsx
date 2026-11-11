import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  /** Where the open tab's actions go: the right end of the tab bar. */
  slot: HTMLElement | null
  /** Only the open panel puts its actions in the bar. */
  active: boolean
  children: ReactNode
}

/**
 * A panel's actions, drawn in the tab bar rather than in a header row of the
 * panel's own. The panel still owns them — their state, their handlers — and
 * only lends them to the bar while its tab is the open one, so the list can
 * start straight under the tabs.
 */
const PanelActions = ({ slot, active, children }: Props) =>
  slot && active
    ? createPortal(<div className="panel-actions">{children}</div>, slot)
    : null

export default PanelActions
