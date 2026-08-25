import { useEffect, useRef } from 'react'
import { isTypingTarget, matchesHotkey, parseHotkey } from '../utils/hotkeys'

type Options = {
  /** Turn the binding off without unmounting the component that owns it. */
  enabled?: boolean
  /**
   * By default a hotkey stays out of the way while someone is typing. Set this
   * for the few that have to work from inside a field — closing what they are
   * typing into, mostly.
   */
  allowInInput?: boolean
  /** Let the browser keep its own meaning for the combo. */
  preventDefault?: boolean
}

type Binding = {
  combo: string
  handler: (event: KeyboardEvent) => void
  options: Required<Options>
}

/**
 * One listener for the whole app, so the order bindings fire in is defined:
 * the most recently mounted wins, which is what a dialog opening over the page
 * needs. The first binding that matches handles the key.
 */
const bindings: Binding[] = []

const onKeyDown = (event: KeyboardEvent) => {
  if (event.repeat) return
  const typing = isTypingTarget(event.target)
  for (let i = bindings.length - 1; i >= 0; i--) {
    const binding = bindings[i]!
    if (!binding.options.enabled) continue
    if (typing && !binding.options.allowInInput) continue
    if (!matchesHotkey(event, parseHotkey(binding.combo))) continue
    if (binding.options.preventDefault) event.preventDefault()
    binding.handler(event)
    return
  }
}

const register = (binding: Binding) => {
  if (bindings.length === 0) window.addEventListener('keydown', onKeyDown)
  bindings.push(binding)
  return () => {
    const at = bindings.indexOf(binding)
    if (at !== -1) bindings.splice(at, 1)
    if (bindings.length === 0) window.removeEventListener('keydown', onKeyDown)
  }
}

/**
 * Binds a global hotkey for as long as the component is mounted.
 *
 *   useHotkey('alt+c', toggleChat)
 *   useHotkey('escape', close, { enabled: open, allowInInput: true })
 */
export const useHotkey = (
  combo: string,
  handler: (event: KeyboardEvent) => void,
  options: Options = {},
) => {
  const {
    enabled = true,
    allowInInput = false,
    preventDefault = true,
  } = options
  // The handler is read at keypress time, so a binding never has to be torn
  // down and rebuilt just because the callback identity changed.
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!enabled) return
    return register({
      combo,
      handler: (event) => handlerRef.current(event),
      options: { enabled, allowInInput, preventDefault },
    })
  }, [combo, enabled, allowInInput, preventDefault])
}

export default useHotkey
