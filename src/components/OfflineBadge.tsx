import { useEffect, useState } from 'react'
import { subscribeSyncState, type SyncState } from '@/data/syncEngine'

export function OfflineBadge() {
  const [sync, setSync] = useState<SyncState>({
    status: 'idle',
    pendingCount: 0,
    lastSyncAt: null,
    lastError: null,
    items: [],
  })
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const unsub = subscribeSyncState(setSync)
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      unsub()
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  if (isOnline && sync.pendingCount === 0 && sync.status === 'idle') return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-0 inset-x-0 z-50 px-4 py-2 text-center text-sm font-mono font-bold
        ${!isOnline ? 'bg-red-900 text-red-200' : sync.status === 'error' ? 'bg-amber-800 text-amber-100' : 'bg-primary-container text-on-primary-container'}`}
    >
      {!isOnline && 'לא מחובר — שינויים ישמרו ויסונכרנו בחיבור'}
      {isOnline && sync.status === 'syncing' && `מסנכרן... (${sync.pendingCount} ממתינים)`}
      {isOnline && sync.status === 'error' && `שגיאת סנכרון: ${sync.lastError}`}
      {isOnline && sync.status === 'idle' && sync.pendingCount > 0 && `${sync.pendingCount} שינויים ממתינים לסנכרון`}
    </div>
  )
}
