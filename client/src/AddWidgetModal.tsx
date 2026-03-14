import * as React from 'react'
import { useState } from 'react'
import GenericModal from './ui/GenericModal'
import { type LayoutItem } from './api'

const AddWidgetModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  onAdd: (widget: LayoutItem) => void
}> = ({ isOpen, onClose, onAdd }) => {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !url.trim()) return
    onAdd({
      i: name.trim(),
      x: 0,
      y: Infinity,
      w: 4,
      h: 6,
      url: url.trim(),
    })
    setName('')
    setUrl('')
    onClose()
  }

  return (
    <GenericModal
      isOpen={isOpen}
      onClose={onClose}
      contentLabel="Add new widget"
    >
      <h2 className="modal-title">Add new widget</h2>
      <form className="add-widget-form" onSubmit={handleSubmit}>
        <label className="form-field">
          <span className="form-label">Name</span>
          <input
            className="form-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My feed"
          />
        </label>
        <label className="form-field">
          <span className="form-label">URL</span>
          <input
            className="form-input"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
          />
        </label>
        <div className="form-actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary">
            Add
          </button>
        </div>
      </form>
    </GenericModal>
  )
}

export default React.memo(AddWidgetModal)
