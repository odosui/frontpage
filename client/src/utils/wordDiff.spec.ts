import { describe, expect, it } from 'vitest'
import { hasWordChanges, wordDiff } from './wordDiff'

/** `+word` added, `-word` removed, bare word unchanged — the diff as a string. */
const shape = (before: string, after: string) =>
  wordDiff(before, after)
    .map((w) => (w.kind === 'same' ? w.text : `${w.kind === 'added' ? '+' : '-'}${w.text}`))
    .join(' ')

describe('wordDiff', () => {
  it('marks an appended clause and nothing else', () => {
    expect(shape('the plant was hit', 'the plant was hit on Tuesday')).toBe(
      'the plant was hit +on +Tuesday',
    )
  })

  it('pairs a replaced word in place', () => {
    expect(shape('14 sites were damaged', '21 sites were damaged')).toBe(
      '-14 +21 sites were damaged',
    )
  })

  it('finds a change in the middle of a long line', () => {
    expect(shape('a b c d e f', 'a b X d e f')).toBe('a b -c +X d e f')
  })

  it('carries emphasis through as a flag rather than as markers', () => {
    const diff = wordDiff('hit **14 sites**', 'hit **21 sites**')
    expect(diff.map((w) => `${w.text}:${w.bold}:${w.kind}`)).toEqual([
      'hit:false:same',
      '14:true:removed',
      '21:true:added',
      'sites:true:same',
    ])
  })

  it('reads emphasis alone as no change, in the new weight', () => {
    const diff = wordDiff('hit 14 sites', 'hit **14** sites')
    expect(hasWordChanges(diff)).toBe(false)
    expect(diff.map((w) => w.bold)).toEqual([false, true, false])
  })

  it('handles either side being empty', () => {
    expect(shape('', 'all new')).toBe('+all +new')
    expect(shape('all gone', '')).toBe('-all -gone')
  })
})
