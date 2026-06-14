import { useEffect, useState } from 'react'
import { useQueryClient, useIsFetching } from '@tanstack/react-query'
import { useTheme } from '@/hooks/useTheme'
import { getSelectedSheet } from '@/features/sheet-picker/SheetPickerScreen'
import { subscribeSyncState, type SyncState } from '@/data/syncEngine'
import { useActiveView } from '@/contexts/ActiveViewContext'

interface AppHeaderProps {
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

function HamburgerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function SyncIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      style={spinning ? { animation: 'spin 1s linear infinite' } : undefined}
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  )
}

function WifiOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <circle cx="12" cy="20" r="1" fill="currentColor" />
    </svg>
  )
}

export function AppHeader({ sidebarOpen, onToggleSidebar }: AppHeaderProps) {
  const { theme, toggleTheme } = useTheme()
  const sheet = getSelectedSheet()
  const { name: activeViewName } = useActiveView()
  const queryClient = useQueryClient()

  const [sync, setSync] = useState<SyncState>({ status: 'idle', pendingCount: 0, lastSyncAt: null, lastError: null })
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const unsub = subscribeSyncState(setSync)
    const goOnline  = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online',  goOnline)
    window.addEventListener('offline', goOffline)
    return () => { unsub(); window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline) }
  }, [])

  const isFetching = useIsFetching({ queryKey: ['diary'] }) > 0

  function handleSync() {
    if (!isOnline || isFetching) return
    queryClient.invalidateQueries({ queryKey: ['diary'] })
  }

  const offline  = !isOnline
  const hasError = sync.status === 'error'
  const pending  = sync.pendingCount
  const spinning = isFetching

  const iconColor = offline ? '#f87171' : hasError ? '#f4d35e' : 'var(--color-on-surface-variant)'

  return (
    <>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      <header
        dir="rtl"
        className="sticky top-0 z-40 h-[52px] bg-surface-container border-b border-outline-variant flex items-center justify-between px-4"
      >
        {/* RIGHT: hamburger / close */}
        <button
          onClick={onToggleSidebar}
          className="text-primary flex items-center justify-center w-[44px] h-[44px]"
          aria-label={sidebarOpen ? 'סגור תפריט' : 'פתח תפריט'}
        >
          {sidebarOpen ? <CloseIcon /> : <HamburgerIcon />}
        </button>

        {/* CENTER: active view name or sheet name */}
        <span className="flex-1 text-center text-sm font-bold text-on-surface truncate px-2">
          {activeViewName ?? sheet?.name ?? 'ניהול כוח אדם'}
        </span>

        {/* LEFT: sync + theme */}
        <div className="flex items-center">
          {/* Sync button */}
          <button
            onClick={handleSync}
            disabled={offline || isFetching}
            aria-label={offline ? 'לא מחובר — עובד על נתונים מקומיים' : 'רענן נתונים'}
            title={offline ? 'אין חיבור לאינטרנט — מציג נתונים שמורים' : pending > 0 ? `${pending} שינויים ממתינים לסנכרון` : 'רענן נתונים'}
            className="relative flex items-center justify-center w-[44px] h-[44px] disabled:cursor-not-allowed"
            style={{ color: iconColor }}
          >
            {offline ? <WifiOffIcon /> : <SyncIcon spinning={spinning} />}
            {pending > 0 && (
              <span
                className="absolute top-1.5 right-1.5 min-w-[16px] h-4 rounded-full text-[9px] font-bold flex items-center justify-center px-0.5 leading-none"
                style={{ backgroundColor: offline ? '#f87171' : 'var(--color-primary)', color: '#fff' }}
              >
                {pending > 99 ? '99+' : pending}
              </span>
            )}
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="text-primary flex items-center justify-center w-[44px] h-[44px]"
            aria-label={theme === 'dark' ? 'עבור למצב יום' : 'עבור למצב לילה'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>
    </>
  )
}
