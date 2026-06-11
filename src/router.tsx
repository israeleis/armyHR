import { useState } from 'react'
import { createHashRouter, Outlet, Navigate } from 'react-router-dom'
import { AppHeader } from '@/components/AppHeader'
import { Sidebar } from '@/components/Sidebar'
import { OfflineBadge } from '@/components/OfflineBadge'
import { SignInScreen } from '@/features/auth/SignInScreen'
import { SheetPickerScreen } from '@/features/sheet-picker/SheetPickerScreen'
import { DiaryScreen } from '@/features/diary/DiaryScreen'
import { DailyDetailScreen } from '@/features/daily/DailyDetailScreen'
import { SoldierScreen } from '@/features/soldier/SoldierScreen'
import { TrendsScreen } from '@/features/trends/TrendsScreen'
import { ImportScreen } from '@/features/import/ImportScreen'

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(o => !o)}
      />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <OfflineBadge />
      <div className="flex-1 flex flex-col">
        <Outlet />
      </div>
    </div>
  )
}

export const router = createHashRouter([
  {
    path: '/',
    element: <Navigate to="/diary" replace />,
  },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { path: 'diary', element: <DiaryScreen /> },
      { path: 'diary/:date', element: <DailyDetailScreen /> },
      { path: 'soldier/:id', element: <SoldierScreen /> },
      { path: 'trends', element: <TrendsScreen /> },
      { path: 'import', element: <ImportScreen /> },
      { path: 'sheets', element: <SheetPickerScreen /> },
      { path: 'signin', element: <SignInScreen /> },
      { path: '*', element: <Navigate to="/diary" replace /> },
    ],
  },
])
