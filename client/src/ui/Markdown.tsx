import { Fragment } from 'react'
import { parseBlocks } from '../utils/markdownBlocks'
import InlineBold from './InlineBold'

/** Beyond this the indent eats the column; the analyst never goes past two. */
const MAX_DEPTH = 3

/**
 * The little markdown the analyst writes: paragraphs, bullets, numbered lists
 * and `**bold**`. React nodes throughout, so nothing a model writes — or an
 * article title it quotes — can turn into markup.
 */
const Markdown = ({ text }: { text: string }) => {
  return (
    <div className="markdown">
      {parseBlocks(text).map((block, i) => {
        if (block.kind === 'paragraph') {
          return (
            <p key={i} className="markdown-p">
              {block.lines.map((line, l) => (
                <Fragment key={l}>
                  {l > 0 && <br />}
                  <InlineBold text={line} />
                </Fragment>
              ))}
            </p>
          )
        }

        const List = block.ordered ? 'ol' : 'ul'
        return (
          <List key={i} className="markdown-list">
            {block.items.map((item, n) => (
              <li
                key={n}
                className={`markdown-item is-depth-${Math.min(
                  item.depth,
                  MAX_DEPTH,
                )}`}
              >
                <InlineBold text={item.text} />
              </li>
            ))}
          </List>
        )
      })}
    </div>
  )
}

export default Markdown
