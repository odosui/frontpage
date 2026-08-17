import { type Fact } from '../api'

export type FactDiffRow = {
  /** `added` and `removed` are the two halves of a rewrite when they pair up. */
  kind: 'added' | 'removed' | 'context'
  fact: Fact
  key: string
}

/**
 * One version against the one before it, as a diff.
 *
 * Facts are matched by their id rather than by their text, which is what makes
 * a rewording readable: the same fact appears once struck out and once as it
 * now reads, instead of as an unrelated removal and addition. A fact whose
 * confidence moved counts as rewritten too — the number is part of the claim.
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
      rows.push({ kind: 'removed', fact: old, key: `-${fact.id}` })
      rows.push({ kind: 'added', fact, key: `+${fact.id}` })
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

/**
 * What the diff amounts to, for the one line that stands in for it. Counted by
 * fact rather than by row: a rewrite is two rows but one change, so the id is
 * what gets tallied and the pair of kinds it appears under is what names it.
 */
export function diffCounts(rows: FactDiffRow[]): FactDiffCounts {
  const kinds = new Map<string, { added: boolean; removed: boolean }>()

  for (const row of rows) {
    if (row.kind === 'context') continue
    const entry = kinds.get(row.fact.id) ?? { added: false, removed: false }
    entry[row.kind] = true
    kinds.set(row.fact.id, entry)
  }

  const counts: FactDiffCounts = { added: 0, removed: 0, rewritten: 0 }
  for (const entry of kinds.values()) {
    if (entry.added && entry.removed) counts.rewritten++
    else if (entry.added) counts.added++
    else counts.removed++
  }

  return counts
}
