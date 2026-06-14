import { useState, useEffect } from 'react'
import { createHashRouter, Outlet, Navigate } from 'react-router-dom'
import { AppHeader } from '@/components/AppHeader'
import { Sidebar } from '@/components/Sidebar'
import { useAuth } from '@/contexts/AuthContext'
import { useGoogleAuth } from '@/features/auth/useGoogleAuth'
import { ActiveViewProvider } from '@/contexts/ActiveViewContext'
import { initSyncEngine } from '@/data/syncEngine'
import { SignInScreen } from '@/features/auth/SignInScreen'
import { SheetPickerScreen } from '@/features/sheet-picker/SheetPickerScreen'
import { DiaryScreen } from '@/features/diary/DiaryScreen'
import { DailyDetailScreen } from '@/features/daily/DailyDetailScreen'
import { SoldierScreen } from '@/features/soldier/SoldierScreen'
import { TrendsScreen } from '@/features/trends/TrendsScreen'
import { SoldiersScreen } from '@/features/soldiers/SoldiersScreen'
import { ImportScreen } from '@/features/import/ImportScreen'
import { TransitionsScreen } from '@/features/transitions/TransitionsScreen'

function useIsOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on  = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

function AppLayout() {
  const { isSignedIn, token, userEmail } = useAuth()
  const { silentRefresh } = useGoogleAuth()
  const isOnline = useIsOnline()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // null = still checking, true = gave up (redirect to signin), false = ok
  const [refreshFailed, setRefreshFailed] = useState<boolean | null>(
    isSignedIn ? false : null
  )

  // Start sync engine once — provides a stable token getter so it always uses the latest token
  const tokenRef = { current: token }
  tokenRef.current = token
  useEffect(() => {
    return initSyncEngine(() => tokenRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (isSignedIn) { setRefreshFailed(false); return }
    if (!isOnline)  { setRefreshFailed(false); return }
    if (!userEmail) { setRefreshFailed(true);  return }

    // Token expired but we know the user's email — try a silent GIS grant
    silentRefresh(userEmail).then(ok => setRefreshFailed(!ok))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (refreshFailed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-on-surface-variant font-mono text-sm">מתחבר...</div>
      </div>
    )
  }

  if (isOnline && !isSignedIn) return <Navigate to="/signin" replace />

  return (
    <ActiveViewProvider>
      <div className="flex flex-col min-h-screen bg-background">
        <AppHeader
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(o => !o)}
        />
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex-1 flex flex-col">
          <Outlet />
        </div>
      </div>
    </ActiveViewProvider>
  )
}

export const router = createHashRouter([
  { path: '/', element: <Navigate to="/trends" replace /> },
  { path: '/signin', element: <SignInScreen /> },
  { path: '/sheets', element: <SheetPickerScreen /> },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { path: 'trends', element: <TrendsScreen /> },
      { path: 'soldiers', element: <SoldiersScreen /> },
      { path: 'transitions', element: <TransitionsScreen /> },
      { path: 'diary', element: <DiaryScreen /> },
      { path: 'diary/:date', element: <DailyDetailScreen /> },
      { path: 'soldier/:id', element: <SoldierScreen /> },
      { path: 'import', element: <ImportScreen /> },
      { path: '*', element: <Navigate to="/trends" replace /> },
    ],
  },
])
