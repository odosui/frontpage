export type ListItem = {
  text: string
  /** 0 for a top-level bullet, 1 for one indented under it, and so on. */
  depth: number
}

export type Block =
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'list'; ordered: boolean; items: ListItem[] }

const BULLET = /^(\s*)[-*]\s+(.*)$/
const NUMBERED = /^(\s*)\d+[.)]\s+(.*)$/
/** Two spaces to a level, which is what models indent with. */
const PER_LEVEL = 2

/**
 * Splits a message into the few block kinds the analyst actually writes:
 * paragraphs, bullet lists and numbered lists. Inline `**bold**` is left in the
 * text for the renderer to handle.
 *
 * Deliberately not a markdown parser. The text comes from a prompt we control,
 * and a hand-written splitter renders as react nodes — headings, code fences
 * and raw html stay literal instead of becoming markup.
 */
export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []

  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      blocks.push({ kind: 'paragraph', lines: [] })
      continue
    }

    const bullet = BULLET.exec(line)
    const numbered = NUMBERED.exec(line)
    const match = bullet ?? numbered

    if (match) {
      const item = {
        text: match[2]!,
        depth: Math.floor(match[1]!.length / PER_LEVEL),
      }
      const last = blocks[blocks.length - 1]
      const ordered = numbered !== null && bullet === null

      // a list continues while the markers agree; a switch starts a new one
      if (last?.kind === 'list' && last.ordered === ordered) {
        last.items.push(item)
      } else {
        blocks.push({ kind: 'list', ordered, items: [item] })
      }
      continue
    }

    const last = blocks[blocks.length - 1]
    if (last?.kind === 'paragraph' && last.lines.length > 0) {
      last.lines.push(line)
    } else {
      blocks.push({ kind: 'paragraph', lines: [line] })
    }
  }

  // blank lines are only ever separators, so empty paragraphs never render
  return blocks.filter(
    (block) => block.kind !== 'paragraph' || block.lines.length > 0,
  )
}
