import { useState } from 'react'
import Chat from './Chat'
import { HOTKEYS, useHotkey } from './hotkeys'

type Props = {
  dashboardId: string
  dashboardName: string
  onChanged?: () => void
}

/** A persistent chat session in a panel hovering over the dashboard. */
const FloatingChat = ({ dashboardId, dashboardName, onChanged }: Props) => {
  const [open, setOpen] = useState(false)

  // both from the page and from inside the composer: the same key that opened
  // the panel has to close it again without the cursor having to leave it
  useHotkey(HOTKEYS.toggleChat, () => setOpen((current) => !current), {
    allowInInput: true,
  })
  useHotkey('escape', () => setOpen(false), {
    enabled: open,
    allowInInput: true,
  })

  return (
    <div className="floating-chat">
      <aside className="floating-chat-panel" id="dashboard-chat" hidden={!open}>
        <Chat
          dashboardId={dashboardId}
          dashboardName={dashboardName}
          onChanged={onChanged}
          active={open}
        />
      </aside>

      <button
        className={`floating-chat-toggle${open ? ' is-open' : ''}`}
        type="button"
        aria-label={open ? 'Hide chat' : 'Show chat'}
        aria-controls="dashboard-chat"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        </svg>
      </button>
    </div>
  )
}

export default FloatingChat
