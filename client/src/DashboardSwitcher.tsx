import { useState, useRef, useEffect } from 'react'
import ChevronDownIcon from './icons/ChevronDownIcon'
import EditIcon from './icons/EditIcon'
import TrashIcon from './icons/TrashIcon'
import PlusIcon from './icons/PlusIcon'

type Props = {
  dashboards: string[]
  current: string
  onSelect: (id: string) => void
  onCreate: (name: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
}

const DashboardSwitcher = ({
  dashboards,
  current,
  onSelect,
  onCreate,
  onDelete,
  onRename,
}: Props) => {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
        setEditingId(null)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => {
    if (creating && inputRef.current) inputRef.current.focus()
  }, [creating])

  const handleCreate = () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    onCreate(trimmed)
    setNewName('')
    setCreating(false)
  }

  const handleRename = (id: string) => {
    const trimmed = editName.trim()
    if (!trimmed || trimmed === id) {
      setEditingId(null)
      return
    }
    onRename(id, trimmed)
    setEditingId(null)
  }

  return (
    <div className="dash-switcher" ref={ref}>
      <button className="dash-switcher-trigger" onClick={() => setOpen(!open)}>
        <span className="dash-switcher-label">{current}</span>
        <ChevronDownIcon />
      </button>

      {open && (
        <div className="dash-switcher-dropdown">
          {dashboards.map((id) => (
            <div
              key={id}
              className={`dash-switcher-item${id === current ? ' active' : ''}`}
            >
              {editingId === id ? (
                <input
                  className="dash-switcher-edit-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onBlur={() => handleRename(id)}
                  autoFocus
                />
              ) : (
                <>
                  <button
                    className="dash-switcher-item-btn"
                    onClick={() => {
                      onSelect(id)
                      setOpen(false)
                    }}
                  >
                    {id}
                  </button>
                  <div className="dash-switcher-item-actions">
                    <button
                      className="dash-switcher-action"
                      title="Rename"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingId(id)
                        setEditName(id)
                      }}
                    >
                      <EditIcon />
                    </button>
                    {id !== 'default' && (
                      <button
                        className="dash-switcher-action dash-switcher-action--danger"
                        title="Delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(id)
                        }}
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}

          <div className="dash-switcher-divider" />

          {creating ? (
            <div className="dash-switcher-create-form">
              <input
                ref={inputRef}
                className="dash-switcher-create-input"
                placeholder="Dashboard name..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate()
                  if (e.key === 'Escape') {
                    setCreating(false)
                    setNewName('')
                  }
                }}
              />
              <button
                className="dash-switcher-create-submit"
                onClick={handleCreate}
                disabled={!newName.trim()}
              >
                Add
              </button>
            </div>
          ) : (
            <button
              className="dash-switcher-new-btn"
              onClick={() => setCreating(true)}
            >
              <PlusIcon />
              New dashboard
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default DashboardSwitcher
