export { default as useHotkey } from './useHotkey'

/**
 * Every global hotkey in the app, in one place — the only way to see at a
 * glance that a new one is not already taken. Alt-based combos keep the
 * browser's own shortcuts free.
 */
export const HOTKEYS = {
  /** Show or hide the conversations modal. */
  toggleChat: 'alt+c',
  /** Walk to the previous or next arc. */
  prevDashboard: 'alt+ArrowLeft',
  nextDashboard: 'alt+ArrowRight',
  /** Refresh every source on the arc. */
  refreshAll: 'alt+r',
  /** Open the arc's Latest, Stories or Facts tab. */
  tabLatest: 'alt+1',
  tabStories: 'alt+2',
  tabFacts: 'alt+3',
} as const
