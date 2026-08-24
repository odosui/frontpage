import { describe, expect, it } from 'vitest'
import { dedupeById } from './dedupeById'

describe('dedupeById', () => {
  it('combines lists in order and keeps the first value for each id', () => {
    const first = [
      { id: 1, value: 'first' },
      { id: 2, value: 'second' },
    ]
    const second = [
      { id: 2, value: 'duplicate' },
      { id: 3, value: 'third' },
    ]

    expect(dedupeById(first, second)).toEqual([
      { id: 1, value: 'first' },
      { id: 2, value: 'second' },
      { id: 3, value: 'third' },
    ])
  })

  it('supports string ids and readonly lists', () => {
    const values = [{ id: 'one' }, { id: 'one' }, { id: 'two' }] as const

    expect(dedupeById(values)).toEqual([{ id: 'one' }, { id: 'two' }])
  })
})
