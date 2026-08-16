import * as React from 'react'
import { useState } from 'react'
import GenericModal from './ui/GenericModal'
import { CHANNEL_KINDS, type Channel, type ChannelKind } from './api'

/** Kinds the backend can actually fetch today; the rest are listed as coming. */
const IMPLEMENTED: ChannelKind[] = ['web', 'rss']

const AddChannelModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  onAdd: (channel: Channel) => void
}> = ({ isOpen, onClose, onAdd }) => {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState<ChannelKind>('web')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !url.trim()) return
    onAdd({ id: name.trim(), kind, url: url.trim() })
    setName('')
    setUrl('')
    setKind('web')
    onClose()
  }

  return (
    <GenericModal
      isOpen={isOpen}
      onClose={onClose}
      contentLabel="Add new channel"
    >
      <h2 className="modal-title">Add new channel</h2>
      <form className="add-channel-form" onSubmit={handleSubmit}>
        <label className="form-field">
          <span className="form-label">Name</span>
          <input
            className="form-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My feed"
            autoFocus
          />
        </label>
        <label className="form-field">
          <span className="form-label">Kind</span>
          <select
            className="form-input"
            value={kind}
            onChange={(e) => setKind(e.target.value as ChannelKind)}
          >
            {CHANNEL_KINDS.map((k) => (
              <option key={k} value={k} disabled={!IMPLEMENTED.includes(k)}>
                {IMPLEMENTED.includes(k) ? k : `${k} (not yet)`}
              </option>
            ))}
          </select>
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
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onClose}
          >
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

export default React.memo(AddChannelModal)
