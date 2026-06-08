import { createBrowserRouter, Outlet, Navigate } from 'react-router-dom'
import { BottomNav } from '@/components/BottomNav'
import { OfflineBadge } from '@/components/OfflineBadge'
import { SignInScreen } from '@/features/auth/SignInScreen'
import { SheetPickerScreen } from '@/features/sheet-picker/SheetPickerScreen'
import { DiaryScreen } from '@/features/diary/DiaryScreen'
import { DailyDetailScreen } from '@/features/daily/DailyDetailScreen'
import { SoldierScreen } from '@/features/soldier/SoldierScreen'
import { TrendsScreen } from '@/features/trends/TrendsScreen'
import { ImportScreen } from '@/features/import/ImportScreen'

function AppLayout() {
  return (
    <div className="flex flex-col min-h-screen bg-background pb-16">
      <OfflineBadge />
      <Outlet />
      <BottomNav />
    </div>
  )
}

export const router = createBrowserRouter([
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
