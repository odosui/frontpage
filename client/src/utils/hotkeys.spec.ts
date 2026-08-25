import { describe, expect, it } from 'vitest'
import { isTypingTarget, matchesHotkey, parseHotkey } from './hotkeys'

const event = (over: Partial<KeyboardEvent>) => ({
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  code: '',
  key: '',
  ...over,
})

describe('parseHotkey', () => {
  it('reads modifiers and the key', () => {
    expect(parseHotkey('shift+alt+c')).toMatchObject({
      alt: true,
      shift: true,
      ctrl: false,
      meta: false,
      code: 'KeyC',
      key: 'c',
    })
  })

  it('leaves named keys without a code', () => {
    expect(parseHotkey('alt+ArrowLeft')).toMatchObject({
      code: null,
      key: 'arrowleft',
    })
  })
})

describe('matchesHotkey', () => {
  const altC = parseHotkey('alt+c')

  it('matches a letter by position, not by what it prints', () => {
    // alt+c types "ç" on a Mac
    expect(
      matchesHotkey(event({ altKey: true, code: 'KeyC', key: 'ç' }), altC),
    ).toBe(true)
  })

  it('rejects the same key with an extra modifier', () => {
    expect(
      matchesHotkey(
        event({ altKey: true, shiftKey: true, code: 'KeyC', key: 'ç' }),
        altC,
      ),
    ).toBe(false)
  })

  it('matches named keys by key', () => {
    expect(matchesHotkey(event({ key: 'Escape' }), parseHotkey('escape'))).toBe(
      true,
    )
    expect(
      matchesHotkey(
        event({ altKey: true, key: 'ArrowLeft' }),
        parseHotkey('alt+ArrowLeft'),
      ),
    ).toBe(true)
  })
})

describe('isTypingTarget', () => {
  it('knows a field from the page', () => {
    const el = (tagName: string, isContentEditable = false) =>
      ({ tagName, isContentEditable }) as unknown as EventTarget

    expect(isTypingTarget(el('TEXTAREA'))).toBe(true)
    expect(isTypingTarget(el('INPUT'))).toBe(true)
    expect(isTypingTarget(el('DIV', true))).toBe(true)
    expect(isTypingTarget(el('DIV'))).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})
