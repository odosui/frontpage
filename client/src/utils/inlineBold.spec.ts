import { describe, expect, it } from 'vitest'
import { splitBold } from './inlineBold'

describe('splitBold', () => {
  it('leaves a plain line in one piece', () => {
    expect(splitBold('nothing to mark')).toEqual([
      { text: 'nothing to mark', bold: false },
    ])
  })

  it('picks out a bold run mid-sentence', () => {
    expect(splitBold('deficit reached **6.45 trillion rubles** by July')).toEqual(
      [
        { text: 'deficit reached ', bold: false },
        { text: '6.45 trillion rubles', bold: true },
        { text: ' by July', bold: false },
      ],
    )
  })

  it('handles several runs, including one at each end', () => {
    expect(splitBold('**Ukraine** struck **Novorossiysk**')).toEqual([
      { text: 'Ukraine', bold: true },
      { text: ' struck ', bold: false },
      { text: 'Novorossiysk', bold: true },
    ])
  })

  it('leaves an unpaired marker as text', () => {
    expect(splitBold('a ** dangling marker')).toEqual([
      { text: 'a ** dangling marker', bold: false },
    ])
  })

  it('does not treat empty markers as bold', () => {
    expect(splitBold('nothing **** here')).toEqual([
      { text: 'nothing **** here', bold: false },
    ])
  })

  it('is reusable across calls', () => {
    const once = splitBold('**a** b')
    expect(splitBold('**a** b')).toEqual(once)
  })
})
