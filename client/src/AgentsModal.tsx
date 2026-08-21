import * as React from 'react'
import { Suspense, lazy } from 'react'
import GenericModal from './ui/GenericModal'

// the transcript view is heavy and only ever opens on demand, so it stays out
// of the initial bundle
const Agents = lazy(() => import('./Agents'))

const AgentsModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  dashboardId: string
  prompt: string
  onSavePrompt: (prompt: string) => Promise<void>
}> = ({ isOpen, onClose, dashboardId, prompt, onSavePrompt }) => (
  <GenericModal
    isOpen={isOpen}
    onClose={onClose}
    contentLabel="Agents"
    contentClass="agents-modal"
  >
    <Suspense fallback={<p className="agents-empty">Loading…</p>}>
      <Agents
        dashboardId={dashboardId}
        prompt={prompt}
        onSavePrompt={onSavePrompt}
      />
    </Suspense>
  </GenericModal>
)

export default React.memo(AgentsModal)
