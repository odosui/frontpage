import { splitBold } from './inlineBold'

export type DiffWord = {
  text: string
  /** Whether it sat inside a `**bold**` run in the line it came from. */
  bold: boolean
  kind: 'same' | 'added' | 'removed'
}

/** One word, with the emphasis of the run it belongs to carried along. */
type Word = { text: string; bold: boolean }

/**
 * Two versions of a fact, word by word.
 *
 * A rewritten fact is usually a rewritten clause: a sentence gets a source
 * appended, a figure corrected, a hedge added. Shown as a struck-out line
 * above an almost identical new one, the reader has to diff it by eye — and
 * the longer the fact, the less likely they will. This finds the words that
 * actually moved.
 *
 * The `**` markers are resolved into a flag on each word before anything is
 * compared, which is what stops a bold run that straddles a change from
 * splitting its own markers across two spans and rendering as literal
 * asterisks. It also means emphasis alone is not a change: a word that only
 * gained bold reads as unchanged, and shows in its new weight.
 */
export function wordDiff(before: string, after: string): DiffWord[] {
  const a = words(before)
  const b = words(after)

  // longest common subsequence, on the word text alone. Facts are a sentence
  // or two, so the quadratic table is a few thousand cells at worst
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  )
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i]!.text === b[j]!.text
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }

  const out: DiffWord[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i]!.text === b[j]!.text) {
      // the new line's emphasis wins: it is the version that stands
      out.push({ ...b[j]!, kind: 'same' })
      i++
      j++
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ ...a[i]!, kind: 'removed' })
      i++
    } else {
      out.push({ ...b[j]!, kind: 'added' })
      j++
    }
  }
  while (i < a.length) out.push({ ...a[i++]!, kind: 'removed' })
  while (j < b.length) out.push({ ...b[j++]!, kind: 'added' })

  return out
}

/** Whether anything but emphasis moved — an all-`same` diff is not worth showing as one. */
export function hasWordChanges(diff: DiffWord[]): boolean {
  return diff.some((word) => word.kind !== 'same')
}

function words(text: string): Word[] {
  const out: Word[] = []
  for (const segment of splitBold(text)) {
    for (const word of segment.text.match(/\S+/g) ?? []) {
      out.push({ text: word, bold: segment.bold })
    }
  }
  return out
}
