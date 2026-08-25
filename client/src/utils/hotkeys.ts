/**
 * Hotkeys are written the way people say them: "alt+c", "mod+k", "shift+alt+
 * ArrowLeft". `mod` is command on a Mac and control everywhere else, so one
 * string covers both.
 */
export type ParsedHotkey = {
  alt: boolean
  ctrl: boolean
  meta: boolean
  shift: boolean
  /** The physical key, as a KeyboardEvent.code when we can name one. */
  code: string | null
  /** The printed key, for anything without a stable code (Escape, arrows). */
  key: string
}

const isMac = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/**
 * Letters and digits are matched by position, not by what they print: alt+c on
 * a Mac types "ç", and a French keyboard puts digits behind shift.
 */
const codeFor = (key: string): string | null => {
  if (/^[a-z]$/.test(key)) return `Key${key.toUpperCase()}`
  if (/^[0-9]$/.test(key)) return `Digit${key}`
  return null
}

export const parseHotkey = (combo: string): ParsedHotkey => {
  const parts = combo.split('+').map((part) => part.trim().toLowerCase())
  const key = parts.pop() ?? ''
  const has = (name: string) => parts.includes(name)
  const mod = has('mod')
  return {
    alt: has('alt') || has('option'),
    ctrl: has('ctrl') || has('control') || (mod && !isMac()),
    meta: has('meta') || has('cmd') || has('command') || (mod && isMac()),
    shift: has('shift'),
    code: codeFor(key),
    key,
  }
}

export const matchesHotkey = (
  event: Pick<
    KeyboardEvent,
    'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'code' | 'key'
  >,
  hotkey: ParsedHotkey,
): boolean => {
  if (event.altKey !== hotkey.alt) return false
  if (event.ctrlKey !== hotkey.ctrl) return false
  if (event.metaKey !== hotkey.meta) return false
  if (event.shiftKey !== hotkey.shift) return false
  if (hotkey.code) return event.code === hotkey.code
  return event.key.toLowerCase() === hotkey.key
}

/** Where a keystroke belongs to the text being typed, not to the app. */
export const isTypingTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null
  if (!el) return false
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  )
}
