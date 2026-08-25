import { CONFIDENCE_LABELS, type Fact, type FactsVersion } from '../../api'
import GenericModal from '../GenericModal'
import InlineBold from '../InlineBold'
import { formatWhen } from '../../utils/dates'
import {
  diffCounts,
  diffFacts,
  type FactDiffRow,
} from '../../utils/factsDiff'
import { wordDiff } from '../../utils/wordDiff'
import FactDiffText from './FactDiffText'

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
                    {MARKS[row.kind]}
                  </span>
                  <Confidence row={row} />
                  <span className="facts-diff-content">
                    <span className="facts-diff-text">
                      {row.previous ? (
                        <FactDiffText
                          diff={wordDiff(
                            row.previous.content,
                            row.fact.content,
                          )}
                        />
                      ) : (
                        <InlineBold text={row.fact.content} />
                      )}
                    </span>
                    {row.previous && <SourceChanges row={row} />}
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

const MARKS: Record<FactDiffRow['kind'], string> = {
  added: '+',
  removed: '−',
  rewritten: '~',
  context: ' ',
}

/**
 * The rung, and where it came from when it moved. A confidence that changed is
 * as much of the revision as a reworded clause, and on a collapsed rewrite row
 * there is no struck-out copy left to carry the old number.
 */
const Confidence = ({ row }: { row: FactDiffRow }) => {
  const badge = (fact: Fact, extra = '') => (
    <span
      className={`fact-confidence is-${fact.confidence}${extra}`}
      title={`${fact.confidence}/5 — ${CONFIDENCE_LABELS[fact.confidence]}`}
    >
      {fact.confidence}
    </span>
  )

  if (!row.previous || row.previous.confidence === row.fact.confidence) {
    return badge(row.fact)
  }

  return (
    <span className="facts-diff-confidence-move">
      {badge(row.previous, ' is-was')}
      {badge(row.fact)}
    </span>
  )
}

/** The evidence that moved even when the wording and confidence did not. */
const SourceChanges = ({ row }: { row: FactDiffRow }) => {
  if (!row.previous) return null

  const before = new Set(row.previous.articleIds)
  const after = new Set(row.fact.articleIds)
  const added = row.fact.sources.filter((source) => !before.has(source.id))
  const removed = row.previous.sources.filter(
    (source) => !after.has(source.id),
  )

  if (added.length === 0 && removed.length === 0) return null

  return (
    <span className="facts-diff-sources">
      {removed.map((source) => (
        <a
          key={`-${source.id}`}
          className="facts-diff-source is-removed"
          href={source.url}
          target="_blank"
          rel="noreferrer"
        >
          − source: {source.title}
        </a>
      ))}
      {added.map((source) => (
        <a
          key={`+${source.id}`}
          className="facts-diff-source is-added"
          href={source.url}
          target="_blank"
          rel="noreferrer"
        >
          + source: {source.title}
        </a>
      ))}
    </span>
  )
}

export default FactsVersionModal
