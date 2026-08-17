import { type FactsVersion } from '../../api'
import { formatWhen, timeAgo } from '../../utils/dates'
import { diffCounts, diffFacts } from '../../utils/factsDiff'

type Props = {
  /** Newest first, as the api returns them. */
  versions: FactsVersion[]
  onOpen: (version: FactsVersion) => void
}

/**
 * How this arc's knowledge got to where it is, one line per revision.
 *
 * A line is all a revision gets here: the reasoning behind a rewrite runs to a
 * paragraph, and three of those stacked above the facts push the facts —
 * which are what the pane is for — off the screen. What the line carries is
 * enough to pick one out; opening it is what shows the reasoning and what
 * actually changed.
 */
const FactsHistory = ({ versions, onOpen }: Props) => {
  if (versions.length === 0) {
    return (
      <p className="facts-placeholder">
        Nothing written down yet, so there is nothing to look back at.
      </p>
    )
  }

  return (
    <ol className="facts-versions">
      {versions.map((entry, i) => {
        // the versions run newest first, so the one after it is the one before
        const counts = diffCounts(
          diffFacts(versions[i + 1]?.facts ?? [], entry.facts),
        )

        return (
          <li key={entry.id}>
            <button
              className="facts-version"
              onClick={() => onOpen(entry)}
              title={
                entry.reasoning ?? `Version ${entry.version}, with what changed`
              }
            >
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

              {/* what it did, in the shorthand a commit list uses */}
              <span className="facts-version-counts">
                {counts.added > 0 && (
                  <span className="is-added">+{counts.added}</span>
                )}
                {counts.removed > 0 && (
                  <span className="is-removed">−{counts.removed}</span>
                )}
                {counts.rewritten > 0 && (
                  <span className="is-rewritten">~{counts.rewritten}</span>
                )}
              </span>
              <span className="facts-version-count">{entry.facts.length}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

export default FactsHistory
