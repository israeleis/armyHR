import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useSheetHistory } from '@/hooks/useSheetHistory'
import { getSelectedSheet, setSelectedSheet } from '@/features/sheet-picker/SheetPickerScreen'

const NAV_ITEMS = [
  {
    to: '/diary', label: 'יומן',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/>
      </svg>
    ),
  },
  {
    to: '/trends', label: 'מגמות',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
  },
  {
    to: '/import', label: 'ייבוא',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
    ),
  },
]

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
  const { pathname } = useLocation()
  const { signOut } = useAuth()
  const { history, addSheet, removeSheet, refresh } = useSheetHistory()
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null)
  const activeSheet = getSelectedSheet()

  // Re-read localStorage when drawer opens so sheets added via /sheets page appear
  useEffect(() => {
    if (open) refresh()
  }, [open])

  function handleSelectSheet(sheet: { id: string; name: string; tabName?: string; readOnly?: boolean }) {
    if (!sheet.tabName) return  // stale history entry without tabName — skip
    const entry = { id: sheet.id, name: sheet.name, tabName: sheet.tabName, readOnly: sheet.readOnly ?? false }
    addSheet(entry)
    setSelectedSheet(entry)
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
        {/* Navigation */}
        <nav className="px-3 pt-3 pb-2 border-b border-outline-variant space-y-0.5">
          {NAV_ITEMS.map(({ to, label, icon }) => {
            const active = pathname.startsWith(to)
            return (
              <button
                key={to}
                onClick={() => { navigate(to); onClose() }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-bold transition-colors text-right
                  ${active
                    ? 'bg-primary-container text-on-primary-container'
                    : 'text-on-surface-variant hover:bg-surface-high hover:text-on-surface'}`}
              >
                <span className="shrink-0">{icon}</span>
                <span className="flex-1">{label}</span>
              </button>
            )
          })}
        </nav>

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
