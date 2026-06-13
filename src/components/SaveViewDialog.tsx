import { useState } from 'react'

interface SaveViewDialogProps {
  open: boolean
  onClose: () => void
  onSave: (name: string) => Promise<void>
}

export function SaveViewDialog({ open, onClose, onSave }: SaveViewDialogProps) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) return null

  async function handleSave() {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      await onSave(name.trim())
      setName('')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    setName('')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70" dir="rtl">
      <div className="bg-surface-high border border-outline-variant rounded-lg p-5 w-[85%] max-w-[320px] shadow-xl">
        <h3 className="text-sm font-bold text-on-surface mb-4">שמור תצוגה</h3>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleClose() }}
          placeholder="שם התצוגה..."
          autoFocus
          dir="rtl"
          className="w-full bg-surface-container border border-outline-variant rounded-md px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary mb-4"
        />
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="flex-1 text-sm font-bold bg-primary text-on-primary rounded-md py-2 hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {saving ? 'שומר...' : 'שמור'}
          </button>
          <button
            onClick={handleClose}
            className="flex-1 text-sm font-bold text-on-surface-variant border border-outline-variant rounded-md py-2 hover:bg-surface-high transition-colors"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
