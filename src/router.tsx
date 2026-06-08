import { createBrowserRouter, Outlet, Navigate } from 'react-router-dom'
import { BottomNav } from '@/components/BottomNav'
import { OfflineBadge } from '@/components/OfflineBadge'
import { SignInScreen } from '@/features/auth/SignInScreen'
import { SheetPickerScreen } from '@/features/sheet-picker/SheetPickerScreen'
import { DiaryScreen } from '@/features/diary/DiaryScreen'

// Placeholder for screens implemented in later tasks
function Placeholder({ name }: { name: string }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8 text-center text-on-surface-variant">
      <div>
        <div className="text-4xl mb-4">🚧</div>
        <div className="font-bold">{name}</div>
        <div className="text-sm mt-2 font-mono text-outline">בבניה</div>
      </div>
    </div>
  )
}

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
      { path: 'diary/:date', element: <Placeholder name="פירוט יומי" /> },
      { path: 'soldier/:id', element: <Placeholder name="הסטטוס שלי" /> },
      { path: 'trends', element: <Placeholder name="מגמות זמינות" /> },
      { path: 'import', element: <Placeholder name="ייבוא מקובץ" /> },
      { path: 'sheets', element: <SheetPickerScreen /> },
      { path: 'signin', element: <SignInScreen /> },
      { path: '*', element: <Navigate to="/diary" replace /> },
    ],
  },
])
