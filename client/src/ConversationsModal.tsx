import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Agents from './Agents'
import { HOTKEYS, useHotkey } from './hotkeys'

type Props = {
  dashboardId: string
  dashboardName: string
  onChanged?: () => void
  prompt: string
  onSavePrompt: (prompt: string) => Promise<void>
  isOpen: boolean
  onClose: () => void
  onToggle: () => void
}

/** Keep the workspace mounted so closing it preserves selection and drafts. */
const ConversationsModal = ({ isOpen, onClose, onToggle, ...props }: Props) => {
  const panel = useRef<HTMLElement>(null)
  useHotkey(HOTKEYS.toggleChat, onToggle, { allowInInput: true })
  useHotkey('escape', onClose, { enabled: isOpen, allowInInput: true })

  useEffect(() => {
    if (!isOpen) return
    const previous = document.activeElement as HTMLElement | null
    const shell = document.querySelector<HTMLElement>('.app-shell')
    const wasInert = shell?.inert ?? false
    if (shell) shell.inert = true
    panel.current?.querySelector<HTMLElement>('button')?.focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const elements = Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), summary, a[href]',
        ) ?? [],
      ).filter((el) => el.getClientRects().length > 0)
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', trap)
    return () => {
      if (shell) shell.inert = wasInert
      document.removeEventListener('keydown', trap)
      if (previous?.isConnected) previous.focus()
    }
  }, [isOpen])

  return createPortal(
    <div className="conversations-modal" hidden={!isOpen}>
      <div className="conversation-backdrop" onClick={onClose} />
      <aside
        ref={panel}
        className="conversations-modal-panel"
        id="dashboard-conversations"
        role="dialog"
        aria-modal="true"
        aria-label="Conversations"
      >
        <Agents {...props} active={isOpen} onClose={onClose} />
      </aside>
    </div>,
    document.body,
  )
}
export default ConversationsModal
