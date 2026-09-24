import { XIcon } from '@primer/octicons-react'
import * as React from 'react'
import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { usePresence } from './usePresence'

const GenericModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  contentLabel: string
  contentClass?: string
  children: React.ReactNode
}> = ({ isOpen, onClose, children, contentLabel, contentClass }) => {
  const { mounted, shown } = usePresence(isOpen)
  // what was on screen when it closed, so the exit fades that out rather
  // than whatever the closed state renders
  const lastChildren = useRef(children)
  if (isOpen) lastChildren.current = children

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  if (!mounted) return null

  return createPortal(
    <div
      className={`generic-modal-overlay${shown ? ' is-shown' : ''}`}
      role="presentation"
      onClick={handleOverlayClick}
    >
      <div
        className="generic-modal"
        aria-modal="true"
        role="dialog"
        aria-label={contentLabel}
      >
        <a
          className="modalClose"
          href="#"
          onClick={(e) => {
            e.preventDefault()
            onClose()
          }}
        >
          <XIcon />
        </a>
        <div className={['generic-modal-content', contentClass].join(' ')}>
          {lastChildren.current}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default React.memo(GenericModal)
