import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useSheetHistory } from '@/hooks/useSheetHistory'
import { getSelectedSheet, setSelectedSheet } from '@/features/sheet-picker/SheetPickerScreen'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  )
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { history, addSheet, removeSheet, refresh } = useSheetHistory()
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null)
  const activeSheet = getSelectedSheet()

  // Re-read localStorage when drawer opens so sheets added via /sheets page appear
  useEffect(() => {
    if (open) refresh()
  }, [open])

  function handleSelectSheet(sheet: { id: string; name: string }) {
    addSheet(sheet)
    setSelectedSheet(sheet)
    onClose()
    navigate('/diary')
  }

  function handleConfirmRemove() {
    if (removeTarget) {
      removeSheet(removeTarget.id)
      setRemoveTarget(null)
    }
  }

  function handleExit() {
    signOut()
    onClose()
    navigate('/signin', { replace: true })
  }

  return (
    <>
      {/* Dim overlay — click to close */}
      {open && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 bg-black/60"
          style={{ top: '52px' }}
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <div
        dir="rtl"
        className={[
          'fixed top-[52px] right-0 bottom-0 z-50',
          'w-[78%] max-w-[320px]',
          'bg-surface-container border-l border-outline-variant',
          'flex flex-col',
          'transition-transform duration-200 ease-in-out',
          open ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        {/* Section label */}
        <div className="px-4 pt-4 pb-2">
          <span className="text-[11px] font-mono font-bold text-primary uppercase tracking-wider">
            גיליונות שנפתחו
          </span>
        </div>

        {/* Sheet list */}
        <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1.5">
          {history.length === 0 && (
            <p className="text-xs text-on-surface-variant text-right px-1 py-3">
              אין גיליונות בהיסטוריה
            </p>
          )}
          {history.map(sheet => {
            const isActive = sheet.id === activeSheet?.id
            return (
              <div
                key={sheet.id}
                className={[
                  'flex items-center gap-2 rounded-md px-3',
                  isActive
                    ? 'bg-primary-container text-on-primary-container'
                    : 'bg-surface-high text-on-surface-variant',
                ].join(' ')}
              >
                <button
                  className="flex-1 text-sm font-medium text-right truncate min-w-0 py-2.5"
                  onClick={() => !isActive && handleSelectSheet(sheet)}
                  disabled={isActive}
                >
                  {sheet.name}
                </button>
                {isActive && (
                  <span className="text-[10px] font-mono shrink-0 opacity-60">✓ פעיל</span>
                )}
                {!isActive && (
                  <button
                    onClick={() => setRemoveTarget(sheet)}
                    className="shrink-0 flex items-center justify-center w-[36px] h-[44px] text-outline hover:text-error transition-colors"
                    aria-label={`הסר ${sheet.name}`}
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer actions */}
        <div className="border-t border-outline-variant px-4 py-2">
          <button
            onClick={() => { navigate('/sheets'); onClose() }}
            className="w-full text-right text-sm font-bold text-primary py-3"
          >
            + בחר גיליון חדש
          </button>
          <button
            onClick={handleExit}
            className="w-full text-right text-sm font-bold text-error py-3"
          >
            יציאה
          </button>
        </div>
      </div>

      {/* Remove confirmation modal */}
      {removeTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70"
          dir="rtl"
        >
          <div className="bg-surface-high border border-outline-variant rounded-lg p-5 w-[80%] max-w-[300px] shadow-xl">
            <h3 className="text-sm font-bold text-on-surface mb-2">הסרת גיליון</h3>
            <p className="text-xs text-on-surface-variant mb-5">
              להסיר את &ldquo;{removeTarget.name}&rdquo; מהרשימה?
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleConfirmRemove}
                className="text-sm font-bold text-error border border-error rounded-md px-4 py-2 hover:bg-error/10 transition-colors"
              >
                הסר
              </button>
              <button
                onClick={() => setRemoveTarget(null)}
                className="text-sm font-bold text-on-surface-variant border border-outline-variant rounded-md px-4 py-2 hover:bg-surface-high transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
