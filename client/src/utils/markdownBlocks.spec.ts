import { describe, expect, it } from 'vitest'
import { parseBlocks } from './markdownBlocks'

describe('parseBlocks', () => {
  it('keeps consecutive lines in one paragraph', () => {
    expect(parseBlocks('first line\nsecond line')).toEqual([
      { kind: 'paragraph', lines: ['first line', 'second line'] },
    ])
  })

  it('splits paragraphs on a blank line', () => {
    expect(parseBlocks('one\n\ntwo')).toEqual([
      { kind: 'paragraph', lines: ['one'] },
      { kind: 'paragraph', lines: ['two'] },
    ])
  })

  it('gathers a bullet list', () => {
    expect(parseBlocks('- budget deficit\n- oil revenue')).toEqual([
      {
        kind: 'list',
        ordered: false,
        items: [
          { text: 'budget deficit', depth: 0 },
          { text: 'oil revenue', depth: 0 },
        ],
      },
    ])
  })

  it('reads indentation as nesting', () => {
    const blocks = parseBlocks('- outer\n  - inner\n    - deeper')

    expect(blocks).toEqual([
      {
        kind: 'list',
        ordered: false,
        items: [
          { text: 'outer', depth: 0 },
          { text: 'inner', depth: 1 },
          { text: 'deeper', depth: 2 },
        ],
      },
    ])
  })

  it('tells numbered lists from bulleted ones', () => {
    const blocks = parseBlocks('1. first\n2. second')

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ kind: 'list', ordered: true })
  })

  it('starts a new list when the marker changes', () => {
    const blocks = parseBlocks('- bullet\n1. numbered')

    expect(blocks).toHaveLength(2)
    expect(blocks.map((b) => b.kind === 'list' && b.ordered)).toEqual([
      false,
      true,
    ])
  })

  it('leaves inline bold in the text', () => {
    expect(parseBlocks('- **84%** that the deficit grows')).toEqual([
      {
        kind: 'list',
        ordered: false,
        items: [{ text: '**84%** that the deficit grows', depth: 0 }],
      },
    ])
  })

  it('separates a list from the paragraph after it', () => {
    const blocks = parseBlocks('intro:\n- a\n- b\n\nafter')

    expect(blocks.map((b) => b.kind)).toEqual([
      'paragraph',
      'list',
      'paragraph',
    ])
  })

  it('drops blank lines rather than rendering them', () => {
    expect(parseBlocks('\n\n\n')).toEqual([])
  })
})
