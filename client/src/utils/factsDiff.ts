import { type Fact } from '../api'

export type FactDiffRow = {
  kind: 'added' | 'removed' | 'rewritten' | 'context'
  /** The fact as it now stands — or as it last stood, on a removal. */
  fact: Fact
  /** What it said before. Only on a rewrite, which is the pair in one row. */
  previous?: Fact
  key: string
}

/**
 * One version against the one before it, as a diff.
 *
 * Facts are matched by their id rather than by their text, which is what makes
 * a rewording readable: the same fact stays one row instead of appearing as an
 * unrelated removal and addition. A rewrite keeps both versions on that row so
 * the words that moved can be marked inside the line — two near-identical
 * paragraphs stacked one above the other are a diff the reader has to do by
 * eye. A fact whose confidence moved counts as rewritten too: the number is
 * part of the claim.
 */
export function diffFacts(previous: Fact[], current: Fact[]): FactDiffRow[] {
  const before = new Map(previous.map((fact) => [fact.id, fact]))
  const rows: FactDiffRow[] = []

  for (const fact of current) {
    const old = before.get(fact.id)
    if (!old) {
      rows.push({ kind: 'added', fact, key: `+${fact.id}` })
    } else if (
      old.content !== fact.content ||
      old.confidence !== fact.confidence
    ) {
      rows.push({
        kind: 'rewritten',
        fact,
        previous: old,
        key: `~${fact.id}`,
      })
    } else {
      rows.push({ kind: 'context', fact, key: ` ${fact.id}` })
    }
  }

  // what is gone has no place left in the new order, so it goes at the end
  const kept = new Set(current.map((fact) => fact.id))
  for (const fact of previous) {
    if (!kept.has(fact.id)) {
      rows.push({ kind: 'removed', fact, key: `-${fact.id}` })
    }
  }

  return rows
}

export type FactDiffCounts = {
  added: number
  removed: number
  rewritten: number
}

/** What the diff amounts to, for the one line that stands in for it. */
export function diffCounts(rows: FactDiffRow[]): FactDiffCounts {
  const counts: FactDiffCounts = { added: 0, removed: 0, rewritten: 0 }

  for (const row of rows) {
    if (row.kind === 'added') counts.added++
    else if (row.kind === 'removed') counts.removed++
    else if (row.kind === 'rewritten') counts.rewritten++
  }

  return counts
}
