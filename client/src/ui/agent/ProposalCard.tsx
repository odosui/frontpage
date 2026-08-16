import { useState } from 'react'
import { type Proposal } from '../../api'

type Props = {
  proposal: Proposal
  onDecide: (id: number, approve: boolean) => Promise<void>
}

/**
 * A change the agent is asking to make. Until Merge is clicked nothing has
 * happened to the data, so the card states what would change and leaves it at
 * that — the decision is the reader's, and this is the only place it can be
 * made.
 */
const ProposalCard = ({ proposal, onDecide }: Props) => {
  const [deciding, setDeciding] = useState(false)

  const decide = async (approve: boolean) => {
    setDeciding(true)
    try {
      await onDecide(proposal.id, approve)
    } finally {
      setDeciding(false)
    }
  }

  const pending = proposal.status === 'pending'

  return (
    <li className={`proposal is-${proposal.status}`}>
      <header className="proposal-head">
        <span className="proposal-title">
          {pending ? 'Needs your approval' : STATUS_LABEL[proposal.status]}
        </span>
      </header>

      <pre className="proposal-summary">{proposal.summary}</pre>

      {proposal.error && <p className="proposal-error">{proposal.error}</p>}

      {pending && (
        <div className="proposal-actions">
          <button
            className="proposal-btn proposal-btn--approve"
            disabled={deciding}
            onClick={() => decide(true)}
          >
            Merge
          </button>
          <button
            className="proposal-btn"
            disabled={deciding}
            onClick={() => decide(false)}
          >
            Keep as is
          </button>
        </div>
      )}
    </li>
  )
}

const STATUS_LABEL: Record<Proposal['status'], string> = {
  pending: 'Needs your approval',
  approved: 'Merged',
  rejected: 'Declined',
  failed: 'Could not be merged',
}

export default ProposalCard
