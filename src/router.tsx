import { useState, useEffect } from 'react'
import { createHashRouter, Outlet, Navigate } from 'react-router-dom'
import { AppHeader } from '@/components/AppHeader'
import { Sidebar } from '@/components/Sidebar'
import { useAuth } from '@/contexts/AuthContext'
import { ActiveViewProvider } from '@/contexts/ActiveViewContext'
import { SignInScreen } from '@/features/auth/SignInScreen'
import { SheetPickerScreen } from '@/features/sheet-picker/SheetPickerScreen'
import { DiaryScreen } from '@/features/diary/DiaryScreen'
import { DailyDetailScreen } from '@/features/daily/DailyDetailScreen'
import { SoldierScreen } from '@/features/soldier/SoldierScreen'
import { TrendsScreen } from '@/features/trends/TrendsScreen'
import { SoldiersScreen } from '@/features/soldiers/SoldiersScreen'
import { ImportScreen } from '@/features/import/ImportScreen'

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
  const { isSignedIn } = useAuth()
  const isOnline = useIsOnline()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Only block access when ONLINE and not authenticated.
  // Offline: allow cached data to show; redirect when connectivity returns.
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
  // Public routes — no auth required, no AppLayout wrapper
  { path: '/signin', element: <SignInScreen /> },
  { path: '/sheets', element: <SheetPickerScreen /> },
  // Protected routes — AppLayout redirects to /signin if not authenticated
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { path: 'trends', element: <TrendsScreen /> },
      { path: 'soldiers', element: <SoldiersScreen /> },
      { path: 'diary', element: <DiaryScreen /> },
      { path: 'diary/:date', element: <DailyDetailScreen /> },
      { path: 'soldier/:id', element: <SoldierScreen /> },
      { path: 'import', element: <ImportScreen /> },
      { path: '*', element: <Navigate to="/trends" replace /> },
    ],
  },
])
