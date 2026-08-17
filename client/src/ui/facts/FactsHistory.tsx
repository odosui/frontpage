import { type FactsVersion } from '../../api'
import InlineBold from '../InlineBold'
import { formatWhen, timeAgo } from '../../utils/dates'

type Props = {
  versions: FactsVersion[]
  /** The version whose facts the pane is showing. */
  selected: number
  onSelect: (version: number) => void
}

/**
 * How this arc's knowledge got to where it is. Facts are never edited in
 * place — every change writes the whole set again — so each entry here is a
 * complete list that once stood, with who wrote it and why.
 *
 * The reasoning is the point of the panel: a fact that quietly firmed up from
 * rumour to reported says nothing about what convinced anyone, and that is
 * usually the part worth checking months later.
 */
const FactsHistory = ({ versions, selected, onSelect }: Props) => {
  if (versions.length === 0) {
    return (
      <p className="facts-placeholder">
        Nothing written down yet, so there is nothing to look back at.
      </p>
    )
  }

  return (
    <ol className="facts-versions">
      {versions.map((entry) => (
        <li key={entry.id}>
          <button
            className={`facts-version${
              entry.version === selected ? ' is-current' : ''
            }`}
            onClick={() => onSelect(entry.version)}
            aria-current={entry.version === selected}
          >
            <span className="facts-version-head">
              <span className="facts-version-no">v{entry.version}</span>
              <span className="facts-version-author">
                {entry.author === 'analyst' ? 'analyst' : 'you'}
              </span>
              <time
                className="facts-version-when"
                dateTime={entry.createdAt}
                title={formatWhen(entry.createdAt)}
              >
                {timeAgo(entry.createdAt)}
              </time>
              <span className="facts-version-count">
                {entry.facts.length} {entry.facts.length === 1 ? 'fact' : 'facts'}
              </span>
            </span>

            {/* the reader's own edits usually speak for themselves, so a
                version with no reasoning simply says nothing rather than
                apologising for it */}
            {entry.reasoning && (
              <span className="facts-version-why">
                <InlineBold text={entry.reasoning} />
              </span>
            )}
          </button>
        </li>
      ))}
    </ol>
  )
}

export default FactsHistory
