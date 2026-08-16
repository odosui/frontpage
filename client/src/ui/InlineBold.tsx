import { splitBold } from '../utils/inlineBold'

/**
 * Text with its `**bold**` runs rendered. Nodes rather than html, so nothing in
 * a fact — written by a model, or pasted by a reader — can be markup.
 */
const InlineBold = ({ text }: { text: string }) => {
  return (
    <>
      {splitBold(text).map((segment, i) =>
        segment.bold ? (
          <strong key={i}>{segment.text}</strong>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  )
}

export default InlineBold
