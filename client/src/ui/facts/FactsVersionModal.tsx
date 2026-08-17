import { CONFIDENCE_LABELS, type FactsVersion } from '../../api'
import GenericModal from '../GenericModal'
import InlineBold from '../InlineBold'
import { formatWhen } from '../../utils/dates'
import { diffCounts, diffFacts } from '../../utils/factsDiff'

type Props = {
  /** The version being read; null closes the modal. */
  version: FactsVersion | null
  /** The one before it, for the diff. Absent for v1, where everything is new. */
  previous: FactsVersion | null
  onClose: () => void
}

/**
 * One revision in full: why it was made, and what it did to the list.
 *
 * The reasoning is the half that cannot be reconstructed later — the facts
 * themselves are still on the page, but what convinced anyone to change them
 * only exists here. The diff below it is the other half, and reads the way a
 * commit does: what went in, what came out, and the rest for context.
 */
const FactsVersionModal = ({ version, previous, onClose }: Props) => {
  const rows = version ? diffFacts(previous?.facts ?? [], version.facts) : []
  const counts = diffCounts(rows)

  return (
    <GenericModal
      isOpen={version !== null}
      onClose={onClose}
      contentLabel="Facts revision"
      contentClass="facts-diff"
    >
      {version && (
        <>
          <header className="facts-diff-head">
            <h2 className="facts-diff-title">
              <span className="facts-version-no">v{version.version}</span>
              <span className="facts-version-author">
                {version.author === 'analyst' ? 'analyst' : 'you'}
              </span>
              <time
                className="facts-version-when"
                dateTime={version.createdAt}
              >
                {formatWhen(version.createdAt)}
              </time>
            </h2>

            <p className="facts-diff-counts">
              {version.facts.length} facts
              {counts.added > 0 && (
                <span className="is-added"> +{counts.added}</span>
              )}
              {counts.removed > 0 && (
                <span className="is-removed"> −{counts.removed}</span>
              )}
              {counts.rewritten > 0 && (
                <span className="is-rewritten">
                  {' '}
                  {counts.rewritten} rewritten
                </span>
              )}
            </p>
          </header>

          {/* the why beside the what: the reasoning holds still in its own
              column while the diff scrolls past it, so the two can be read
              against each other rather than one after the other */}
          <div className="facts-diff-body">
            <aside className="facts-diff-why">
              {version.reasoning ? (
                <p className="facts-diff-why-text">
                  <InlineBold text={version.reasoning} />
                </p>
              ) : (
                <p className="facts-diff-why-text is-empty">
                  No reasoning given — your own edits are recorded without one.
                </p>
              )}
            </aside>

            <ol className="facts-diff-list">
              {rows.map((row) => (
                <li key={row.key} className={`facts-diff-row is-${row.kind}`}>
                  <span className="facts-diff-mark" aria-hidden="true">
                    {row.kind === 'added'
                      ? '+'
                      : row.kind === 'removed'
                        ? '−'
                        : ' '}
                  </span>
                  <span
                    className={`fact-confidence is-${row.fact.confidence}`}
                    title={`${row.fact.confidence}/5 — ${
                      CONFIDENCE_LABELS[row.fact.confidence]
                    }`}
                  >
                    {row.fact.confidence}
                  </span>
                  <span className="facts-diff-text">
                    <InlineBold text={row.fact.content} />
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </GenericModal>
  )
}

export default FactsVersionModal
