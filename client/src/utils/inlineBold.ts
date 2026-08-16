export type Segment = {
  text: string
  bold: boolean
}

/** `**` pairs, non-greedy, never spanning a blank line. */
const BOLD_RE = /\*\*([^*]+?)\*\*/g

/**
 * Splits a line on its `**bold**` runs. The only markdown the facts use — they
 * are one sentence with the numbers, dates and names picked out — so this is a
 * few lines rather than a markdown library, and it renders as react nodes
 * instead of html, which keeps the text unescaped and unexecutable.
 *
 * An unpaired `**` is left as literal text: someone typing about a footnote
 * should see what they typed.
 */
export function splitBold(text: string): Segment[] {
  const segments: Segment[] = []
  let last = 0
  BOLD_RE.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = BOLD_RE.exec(text)) !== null) {
    if (match.index > last) {
      segments.push({ text: text.slice(last, match.index), bold: false })
    }
    segments.push({ text: match[1]!, bold: true })
    last = match.index + match[0].length
  }

  if (last < text.length) {
    segments.push({ text: text.slice(last), bold: false })
  }
  return segments
}
