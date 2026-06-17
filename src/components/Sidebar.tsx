import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useSheetHistory } from '@/hooks/useSheetHistory'
import { useSavedViews } from '@/hooks/useSavedViews'
import { getSelectedSheet, setSelectedSheet } from '@/features/sheet-picker/SheetPickerScreen'
import type { FilterState } from '@/features/filters'
import { useActiveView, setActiveView, clearActiveView } from '@/contexts/ActiveViewContext'

const NAV_ITEMS = [
  {
    to: '/trends', label: 'דשבורד',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
  },
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
    to: '/soldiers', label: 'חיילים',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
  {
    to: '/transitions', label: 'פתיחות וסגירות',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 16V4m0 0L3 8m4-4l4 4"/>
        <path d="M17 8v12m0 0l4-4m-4 4l-4-4"/>
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

function ViewIcon({ view }: { view: string }) {
  if (view === '/trends') return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  )
  if (view.startsWith('/diary')) return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  )
}

function ChevronIcon({ open: isOpen }: { open: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform 150ms', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { signOut } = useAuth()
  const { history, addSheet, removeSheet, refresh } = useSheetHistory()
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string; tabName: string } | null>(null)
  const [savedViewsExpanded, setSavedViewsExpanded] = useState(true)
  const [deactivatingId, setDeactivatingId] = useState<number | null>(null)
  const { views, deactivateView: doDeactivate } = useSavedViews()
  const activeViews = views.filter(v => v.active)
  const activeSheet = getSelectedSheet()
  const { name: activeViewName } = useActiveView()

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
    navigate('/trends')
  }

  function handleConfirmRemove() {
    if (removeTarget) {
      removeSheet(removeTarget.id, removeTarget.tabName)
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
                onClick={() => { clearActiveView(); navigate(to); onClose() }}
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

        {/* Saved views — collapsible */}
        {activeViews.length > 0 && (
          <div className="border-b border-outline-variant">
            <button
              onClick={() => setSavedViewsExpanded(e => !e)}
              className="w-full flex items-center justify-between px-4 py-2.5"
            >
              <span className="text-[11px] font-mono font-bold text-primary uppercase tracking-wider">
                תצוגות שמורות
              </span>
              <ChevronIcon open={savedViewsExpanded} />
            </button>
            {savedViewsExpanded && (
              <div className="pb-2 px-3 space-y-0.5">
                {activeViews.map(view => {
                  const isSelected = view.name === activeViewName
                  return (
                  <div key={view.rowIndex} className={`flex items-center gap-1 rounded-md group ${isSelected ? 'bg-primary-container' : ''}`}>
                    <button
                      className={`flex-1 flex items-center gap-2 px-2 py-2.5 text-right transition-colors min-w-0 ${
                        isSelected
                          ? 'text-on-primary-container'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                      onClick={() => {
                        setActiveView(view.name)
                        navigate(view.view, { state: { pendingFilter: view.filterState as FilterState, pendingGroupBy: view.groupByKeys, viewName: view.name } })
                        onClose()
                      }}
                    >
                      <span className={`shrink-0 ${isSelected ? 'text-on-primary-container/70' : 'text-on-surface-variant/60'}`}>
                        <ViewIcon view={view.view} />
                      </span>
                      <span className="text-sm font-medium truncate flex-1">{view.name}</span>
                    </button>
                    {deactivatingId === view.rowIndex ? (
                      <button
                        onClick={() => { doDeactivate(view.rowIndex); setDeactivatingId(null) }}
                        className="text-[10px] font-bold text-error shrink-0 px-1.5 py-1 rounded border border-error/40 hover:bg-error/10 transition-colors"
                      >
                        הסתר
                      </button>
                    ) : (
                      <button
                        onClick={() => setDeactivatingId(view.rowIndex)}
                        className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-on-surface-variant transition-opacity shrink-0 p-1"
                        aria-label="אפשרויות"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
                        </svg>
                      </button>
                    )}
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

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
            const isActive = sheet.id === activeSheet?.id && sheet.tabName === activeSheet?.tabName
            return (
              <div
                key={`${sheet.id}-${sheet.tabName}`}
                className={[
                  'flex items-center gap-2 rounded-md px-3',
                  isActive
                    ? 'bg-primary-container text-on-primary-container'
                    : 'bg-surface-high text-on-surface-variant',
                ].join(' ')}
              >
                <button
                  className="flex-1 text-right truncate min-w-0 py-2.5"
                  onClick={() => !isActive && handleSelectSheet(sheet)}
                  disabled={isActive}
                >
                  <div className="text-sm font-medium truncate">{sheet.name}</div>
                  {sheet.tabName && (
                    <div className="text-[10px] font-mono opacity-60 truncate">{sheet.tabName}</div>
                  )}
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
