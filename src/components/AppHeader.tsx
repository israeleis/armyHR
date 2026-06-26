import { useEffect, useRef, useState } from 'react'
import { useQueryClient, useIsFetching } from '@tanstack/react-query'
import { useTheme } from '@/hooks/useTheme'
import { getSelectedSheet } from '@/features/sheet-picker/SheetPickerScreen'
import {
  subscribeSyncState, drainQueue, retryItem, cancelItem,
  type SyncState, type QueueItem, type ItemStatus,
} from '@/data/syncEngine'
import { useActiveView } from '@/contexts/ActiveViewContext'
import { format } from 'date-fns'

interface AppHeaderProps {
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

// ── Icons ──────────────────────────────────────────────────────────────────

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

function WifiOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

// ── Status icons ──────────────────────────────────────────────────────────

function SingleCheck({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function DoubleCheck({ color }: { color: string }) {
  return (
    <svg width="18" height="14" viewBox="0 0 28 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="24 6 13 17 8 12" />
      <polyline points="16 6 5 17 0 12" />
    </svg>
  )
}

function SpinnerIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"
      style={{ animation: 'spin 1s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

function ClockIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function RetryIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 .49-3.51" />
    </svg>
  )
}

// ── Cooldown countdown label ───────────────────────────────────────────────

function CooldownLabel({ until }: { until: number }) {
  const [secs, setSecs] = useState(Math.max(0, Math.ceil((until - Date.now()) / 1000)))
  useEffect(() => {
    if (secs <= 0) return
    const t = setInterval(() => {
      setSecs(Math.max(0, Math.ceil((until - Date.now()) / 1000)))
    }, 500)
    return () => clearInterval(t)
  }, [until])
  if (secs <= 0) return null
  return <span className="text-[9px] font-mono text-on-surface-variant ml-0.5">{secs}s</span>
}

// ── Per-item row ──────────────────────────────────────────────────────────

function QueueRow({ item }: { item: QueueItem }) {
  const isCooldown = !!(item.cooldownUntil && Date.now() < item.cooldownUntil)
  const isCancelled = item.status === 'cancelled'

  const statusIcon = () => {
    switch (item.status as ItemStatus) {
      case 'pending':   return <ClockIcon color="var(--color-on-surface-variant)" />
      case 'sending':   return <SpinnerIcon color="var(--color-primary)" />
      case 'sent':      return <SingleCheck color="var(--color-on-surface-variant)" />
      case 'verified':  return <DoubleCheck color="#c3cc8c" />
      case 'failed':    return (
        <button
          disabled={isCooldown}
          onClick={() => retryItem(item.id)}
          className="flex items-center gap-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          title={isCooldown ? 'ממתין לפני ניסיון חוזר' : 'נסה שוב'}
        >
          <RetryIcon color={isCooldown ? 'var(--color-on-surface-variant)' : 'var(--color-primary)'} />
          {isCooldown && item.cooldownUntil && <CooldownLabel until={item.cooldownUntil} />}
        </button>
      )
      case 'cancelled': return null
    }
  }

  const dateLabel = (() => {
    try { return format(new Date(item.dateKey), 'dd/MM') } catch { return item.dateKey }
  })()

  return (
    <li className={`flex items-center gap-2 px-3 py-2 text-xs border-b border-outline-variant last:border-0 ${isCancelled ? 'opacity-40' : ''}`} dir="rtl">
      {/* Status icon — fixed width slot */}
      <span className="w-5 flex items-center justify-center shrink-0">
        {statusIcon()}
      </span>

      {/* Item description */}
      <span className={`flex-1 font-mono truncate text-on-surface ${isCancelled ? 'line-through' : ''}`}>
        {item.soldierName}
        <span className="text-on-surface-variant mx-1">·</span>
        {dateLabel}
        <span className="text-on-surface-variant mx-1">·</span>
        <span className="text-on-surface-variant">{item.oldValue}</span>
        <span className="mx-1">→</span>
        <span className="text-primary font-bold">{item.newValue}</span>
      </span>

      {/* Cancel button */}
      {/* verified items remain cancellable — they auto-fade in 8s but the user can undo before that */}
      <button
        onClick={() => cancelItem(item.id)}
        disabled={isCancelled || item.status === 'sending'}
        className="shrink-0 text-on-surface-variant hover:text-on-surface transition-colors p-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-on-surface-variant"
        title="בטל"
        aria-label="בטל שינוי"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </li>
  )
}

// ── Main header ───────────────────────────────────────────────────────────

export function AppHeader({ sidebarOpen, onToggleSidebar }: AppHeaderProps) {
  const { theme, toggleTheme } = useTheme()
  const sheet = getSelectedSheet()
  const { name: activeViewName } = useActiveView()
  const queryClient = useQueryClient()

  const [sync, setSync] = useState<SyncState>({
    status: 'idle', pendingCount: 0, lastSyncAt: null, lastError: null, items: [],
  })
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [panelOpen, setPanelOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const chipRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const unsub = subscribeSyncState(setSync)
    const goOnline  = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online',  goOnline)
    window.addEventListener('offline', goOffline)
    return () => { unsub(); window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline) }
  }, [])

  // Close panel on outside click
  useEffect(() => {
    if (!panelOpen) return
    function onDown(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        chipRef.current && !chipRef.current.contains(e.target as Node)
      ) {
        setPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [panelOpen])

  const isFetching = useIsFetching({ queryKey: ['diary'] }) > 0

  function handleSync() {
    if (!isOnline || isFetching) return
    drainQueue().catch(console.error)
    queryClient.invalidateQueries({ queryKey: ['diary'] })
  }

  const offline  = !isOnline
  const pending  = sync.pendingCount
  const hasItems = sync.items.length > 0

  // Chip is visible whenever there are items in the panel
  const showChip = hasItems

  const chipLabel = pending > 0
    ? (pending > 99 ? '99+' : String(pending))
    : null

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

        {/* LEFT: sync chip + theme */}
        <div className="flex items-center gap-1">
          {/* Sync / queue chip */}
          {offline ? (
            <button
              onClick={handleSync}
              disabled
              className="flex items-center justify-center w-[44px] h-[44px] cursor-not-allowed text-red-400"
              title="אין חיבור לאינטרנט — מציג נתונים שמורים"
            >
              <WifiOffIcon />
            </button>
          ) : showChip ? (
            <button
              ref={chipRef}
              onClick={() => setPanelOpen(p => !p)}
              className="flex items-center gap-1 px-2 h-7 rounded-full bg-primary text-on-primary text-xs font-bold transition-colors hover:bg-primary/80"
              title="פתח תור עדכונים"
            >
              {isFetching && <SpinnerIcon color="currentColor" />}
              {chipLabel
                ? <span>{chipLabel}</span>
                : !isFetching && <span className="text-[10px]">✓</span>
              }
            </button>
          ) : (
            <button
              onClick={handleSync}
              disabled={isFetching}
              aria-label="רענן נתונים"
              title="רענן נתונים"
              className="flex items-center justify-center w-[44px] h-[44px] text-on-surface-variant disabled:cursor-not-allowed"
            >
              <svg
                width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
                style={isFetching ? { animation: 'spin 1s linear infinite' } : undefined}
              >
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
          )}

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

      {/* Update queue dropdown panel */}
      {panelOpen && hasItems && (
        <div
          ref={panelRef}
          dir="rtl"
          className="fixed top-[52px] left-0 right-0 z-30 bg-surface-container border-b border-outline-variant shadow-lg max-h-64 overflow-y-auto"
        >
          <ul>
            {sync.items.map(item => (
              <QueueRow key={item.id} item={item} />
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
