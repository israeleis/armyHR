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

function AppLayout() {
  const { isSignedIn, token, userEmail } = useAuth()
  const { silentRefresh } = useGoogleAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Compute initial auth readiness synchronously where possible:
  //   true  = enter app now
  //   false = send to /signin now
  //   null  = waiting for silentRefresh (async)
  const [authReady, setAuthReady] = useState<boolean | null>(() => {
    if (isSignedIn)            return true   // fresh token
    if (!userEmail)            return false  // never signed in / explicit sign-out
    if (!navigator.onLine)     return true   // offline — use cached data
    return null                              // has email + online: try silentRefresh
  })

  // Start sync engine once
  const tokenRef = { current: token }
  tokenRef.current = token
  useEffect(() => {
    return initSyncEngine(() => tokenRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Attempt silent refresh when needed (only fires when authReady starts as null)
  useEffect(() => {
    if (authReady !== null) return
    // authReady is null only when: !isSignedIn && userEmail && navigator.onLine
    silentRefresh(userEmail!).then(ok => setAuthReady(ok ? true : false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (authReady === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-on-surface-variant font-mono text-sm">מתחבר...</div>
      </div>
    )
  }

  if (authReady === false) return <Navigate to="/signin" replace />

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
      { path: 'trends',       element: <TrendsScreen /> },
      { path: 'soldiers',     element: <SoldiersScreen /> },
      { path: 'transitions',  element: <TransitionsScreen /> },
      { path: 'diary',        element: <DiaryScreen /> },
      { path: 'diary/:date',  element: <DailyDetailScreen /> },
      { path: 'soldier/:id',  element: <SoldierScreen /> },
      { path: 'import',       element: <ImportScreen /> },
      { path: '*',            element: <Navigate to="/trends" replace /> },
    ],
  },
])
