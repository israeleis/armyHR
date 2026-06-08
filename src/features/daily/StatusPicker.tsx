import { ALL_STATUSES } from '@/domain/statusVocabulary'
import type { StatusDef } from '@/domain/statusVocabulary'

interface StatusPickerProps {
  currentCode: string
  onSelect: (code: string) => void
  onClose: () => void
}

export function StatusPicker({ currentCode, onSelect, onClose }: StatusPickerProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Sheet */}
      <div
        role="dialog"
        aria-label="בחר סטטוס"
        className="fixed bottom-0 inset-x-0 z-50 bg-surface-container rounded-t-xl pb-safe-area-bottom"
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-outline-variant">
          <h2 className="text-headline-sm font-bold text-on-surface">בחר סטטוס</h2>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface text-2xl leading-none px-2"
            aria-label="סגור"
          >
            ✕
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 p-4">
          {ALL_STATUSES.map((status: StatusDef) => (
            <button
              key={status.code}
              onClick={() => { onSelect(status.code); onClose() }}
              className={`flex flex-col items-center justify-center py-3 rounded-md font-bold text-sm transition-opacity
                ${currentCode === status.code ? 'ring-2 ring-primary' : 'opacity-85 hover:opacity-100'}`}
              style={{ backgroundColor: status.bg, color: status.fg }}
            >
              <span className="text-lg leading-none mb-1">{status.code}</span>
              <span className="text-xs leading-tight text-center">{status.label}</span>
            </button>
          ))}
          {/* Clear / empty option */}
          <button
            onClick={() => { onSelect(''); onClose() }}
            className="flex flex-col items-center justify-center py-3 rounded-md border border-outline text-outline text-sm"
          >
            <span className="text-lg leading-none mb-1">—</span>
            <span className="text-xs">ריק</span>
          </button>
        </div>
      </div>
    </>
  )
}
