import { describe, expect, it } from 'vitest'
import { type Fact } from '../api'
import { diffCounts, diffFacts } from './factsDiff'

const fact = (id: string, content: string, confidence = 3): Fact => ({
  id,
  content,
  confidence,
  articleId: null,
  articleTitle: null,
  articleUrl: null,
  createdAt: '2026-08-17T09:00:00.000Z',
})

describe('diffFacts', () => {
  it('marks a first version as all new', () => {
    const rows = diffFacts([], [fact('f1', 'one'), fact('f2', 'two')])
    expect(rows.map((r) => r.kind)).toEqual(['added', 'added'])
    expect(diffCounts(rows)).toEqual({ added: 2, removed: 0, rewritten: 0 })
  })

  it('leaves an untouched fact as context', () => {
    const rows = diffFacts([fact('f1', 'one')], [fact('f1', 'one')])
    expect(rows).toEqual([
      { kind: 'context', fact: fact('f1', 'one'), key: ' f1' },
    ])
    expect(diffCounts(rows)).toEqual({ added: 0, removed: 0, rewritten: 0 })
  })

  it('keeps a rewording on one row, carrying both versions', () => {
    const rows = diffFacts([fact('f1', 'one')], [fact('f1', 'one, corrected')])
    expect(rows).toEqual([
      {
        kind: 'rewritten',
        fact: fact('f1', 'one, corrected'),
        previous: fact('f1', 'one'),
        key: '~f1',
      },
    ])
    // one fact changed, not one added and one dropped
    expect(diffCounts(rows)).toEqual({ added: 0, removed: 0, rewritten: 1 })
  })

  it('treats a moved confidence as a rewrite — the number is part of the claim', () => {
    const rows = diffFacts([fact('f1', 'one', 2)], [fact('f1', 'one', 4)])
    expect(
      rows.map((r) => [r.kind, r.previous?.confidence, r.fact.confidence]),
    ).toEqual([['rewritten', 2, 4]])
    expect(diffCounts(rows)).toEqual({ added: 0, removed: 0, rewritten: 1 })
  })

  it('puts what was dropped at the end', () => {
    const rows = diffFacts(
      [fact('f1', 'one'), fact('f2', 'two')],
      [fact('f3', 'three'), fact('f1', 'one')],
    )
    expect(rows.map((r) => [r.kind, r.fact.id])).toEqual([
      ['added', 'f3'],
      ['context', 'f1'],
      ['removed', 'f2'],
    ])
    expect(diffCounts(rows)).toEqual({ added: 1, removed: 1, rewritten: 0 })
  })

  it('counts a mixed revision the way the reader would say it', () => {
    const rows = diffFacts(
      [fact('f1', 'kept'), fact('f2', 'dropped'), fact('f3', 'reworded')],
      [fact('f4', 'new'), fact('f3', 'reworded, better'), fact('f1', 'kept')],
    )
    expect(diffCounts(rows)).toEqual({ added: 1, removed: 1, rewritten: 1 })
  })
})
