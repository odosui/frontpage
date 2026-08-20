import { type DiffWord } from '../../utils/wordDiff'

/**
 * A rewritten fact as one line, with the words that moved marked inside it.
 *
 * Words are wrapped in `ins` and `del` rather than in styled spans: what the
 * marks mean is exactly what those elements mean, so a screen reader announces
 * the change instead of reading a sentence that contradicts itself.
 *
 * Emphasis is a flag on each word by the time it arrives here, so a bold run
 * that straddles a change renders in both halves rather than losing its
 * markers to the split.
 */
const FactDiffText = ({ diff }: { diff: DiffWord[] }) => (
  <>
    {diff.map((word, i) => {
      const text = word.bold ? <strong>{word.text}</strong> : word.text
      // the space between words is left outside the mark: inside a `del` it
      // gets struck too, and the rule runs on past the word it belongs to
      const space = i < diff.length - 1 ? ' ' : ''

      return (
        <span key={i}>
          {word.kind === 'added' ? (
            <ins className="facts-diff-ins">{text}</ins>
          ) : word.kind === 'removed' ? (
            <del className="facts-diff-del">{text}</del>
          ) : (
            text
          )}
          {space}
        </span>
      )
    })}
  </>
)

export default FactDiffText
