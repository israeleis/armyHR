import { useState } from 'react'
import { createHashRouter, Outlet, Navigate } from 'react-router-dom'
import { AppHeader } from '@/components/AppHeader'
import { Sidebar } from '@/components/Sidebar'
import { useAuth } from '@/contexts/AuthContext'
import { SignInScreen } from '@/features/auth/SignInScreen'
import { SheetPickerScreen } from '@/features/sheet-picker/SheetPickerScreen'
import { DiaryScreen } from '@/features/diary/DiaryScreen'
import { DailyDetailScreen } from '@/features/daily/DailyDetailScreen'
import { SoldierScreen } from '@/features/soldier/SoldierScreen'
import { TrendsScreen } from '@/features/trends/TrendsScreen'
import { ImportScreen } from '@/features/import/ImportScreen'

function AppLayout() {
  const { isSignedIn } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (!isSignedIn) return <Navigate to="/signin" replace />

  return (
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
      { path: 'diary', element: <DiaryScreen /> },
      { path: 'diary/:date', element: <DailyDetailScreen /> },
      { path: 'soldier/:id', element: <SoldierScreen /> },
      { path: 'import', element: <ImportScreen /> },
      { path: '*', element: <Navigate to="/trends" replace /> },
    ],
  },
])
