import { useState } from 'react'
import { ALL_STATUSES } from '@/domain/statusVocabulary'
import type { StatusDef } from '@/domain/statusVocabulary'

interface Props {
  currentCode: string
  onSave: (newCode: string, comment: string) => void
  onClose: () => void
}

export function StatusEditDialog({ currentCode, onSave, onClose }: Props) {
  const [selectedCode, setSelectedCode] = useState(currentCode)
  const [comment, setComment] = useState('')

  const changed = selectedCode !== currentCode || comment.trim().length > 0

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        dir="rtl"
        className="fixed bottom-0 inset-x-0 z-50 bg-surface-container rounded-t-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-outline-variant">
          <h2 className="text-base font-bold text-on-surface">עדכון סטטוס</h2>
          <button onClick={onClose} className="text-on-surface-variant text-xl leading-none px-2">✕</button>
        </div>

        {/* Status grid */}
        <div className="grid grid-cols-3 gap-2 p-4 pb-2">
          {ALL_STATUSES.map((status: StatusDef) => (
            <button
              key={status.code}
              onClick={() => setSelectedCode(status.code)}
              className={`flex flex-col items-center justify-center py-3 rounded-md font-bold text-sm transition-all
                ${selectedCode === status.code ? 'ring-2 ring-primary scale-105' : 'opacity-80 hover:opacity-100'}`}
              style={{ backgroundColor: status.bg, color: status.fg }}
            >
              <span className="text-lg leading-none mb-1">{status.code}</span>
              <span className="text-xs leading-tight text-center">{status.label}</span>
            </button>
          ))}
          <button
            onClick={() => setSelectedCode('')}
            className={`flex flex-col items-center justify-center py-3 rounded-md border text-sm transition-all
              ${selectedCode === '' ? 'ring-2 ring-primary border-primary text-primary' : 'border-outline text-outline'}`}
          >
            <span className="text-lg leading-none mb-1">—</span>
            <span className="text-xs">ריק</span>
          </button>
        </div>

        {/* Comment */}
        <div className="px-4 pb-2">
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="הערה (אופציונלי)..."
            rows={2}
            className="w-full bg-surface-high border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/50 resize-none"
          />
        </div>

        {/* Save */}
        <div className="px-4 pb-6">
          <button
            onClick={() => { if (changed) onSave(selectedCode, comment.trim()) }}
            disabled={!changed}
            className="w-full py-3 rounded-lg bg-primary text-on-primary font-bold text-sm disabled:opacity-40 transition-opacity"
          >
            שמור שינוי
          </button>
        </div>
      </div>
    </>
  )
}
