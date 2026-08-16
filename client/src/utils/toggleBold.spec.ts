import { describe, expect, it } from 'vitest'
import { toggleBold } from './toggleBold'

/** `[` and `]` mark the selection, for readable cases. */
function run(marked: string) {
  const start = marked.indexOf('[')
  const end = marked.indexOf(']') - 1
  const value = marked.replace(/[[\]]/g, '')
  const next = toggleBold({ value, start, end })

  return (
    next.value.slice(0, next.start) +
    '[' +
    next.value.slice(next.start, next.end) +
    ']' +
    next.value.slice(next.end)
  )
}

describe('toggleBold', () => {
  it('wraps the selection', () => {
    expect(run('deficit hit [6.45 trillion] rubles')).toBe(
      'deficit hit **[6.45 trillion]** rubles',
    )
  })

  it('unwraps a selection that includes the markers', () => {
    expect(run('deficit hit [**6.45 trillion**] rubles')).toBe(
      'deficit hit [6.45 trillion] rubles',
    )
  })

  it('unwraps when the markers sit just outside the selection', () => {
    expect(run('deficit hit **[6.45 trillion]** rubles')).toBe(
      'deficit hit [6.45 trillion] rubles',
    )
  })

  it('leaves empty markers with the caret between them', () => {
    const next = toggleBold({ value: 'hit  rubles', start: 4, end: 4 })

    expect(next.value).toBe('hit **** rubles')
    expect(next.start).toBe(6)
    expect(next.end).toBe(6)
  })

  it('wraps at the very start and end of the text', () => {
    expect(run('[Ukraine] struck')).toBe('**[Ukraine]** struck')
    expect(run('struck [Novorossiysk]')).toBe('struck **[Novorossiysk]**')
  })

  it('is its own inverse', () => {
    const once = toggleBold({ value: 'a big number', start: 2, end: 12 })
    const twice = toggleBold(once)

    expect(twice.value).toBe('a big number')
    expect(twice.start).toBe(2)
    expect(twice.end).toBe(12)
  })
})
