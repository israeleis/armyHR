import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { listUserSheets, type SheetFile } from '@/data/sheetsClient'
import { useSheetHistory } from '@/hooks/useSheetHistory'

const SELECTED_SHEET_KEY = 'army-hr-sheet'

export function getSelectedSheet(): { id: string; name: string } | null {
  try {
    const raw = localStorage.getItem(SELECTED_SHEET_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setSelectedSheet(sheet: { id: string; name: string }) {
  localStorage.setItem(SELECTED_SHEET_KEY, JSON.stringify(sheet))
}

export function SheetPickerScreen() {
  const { token, isSignedIn } = useAuth()
  const navigate = useNavigate()
  const { addSheet } = useSheetHistory()

  useEffect(() => {
    if (!isSignedIn) navigate('/signin', { replace: true })
  }, [isSignedIn, navigate])

  const { data: sheets, isLoading, error } = useQuery({
    queryKey: ['sheets', token],
    queryFn: () => listUserSheets(token!),
    enabled: !!token,
    staleTime: 1000 * 60 * 5,
  })

  function selectSheet(sheet: SheetFile) {
    const entry = { id: sheet.id, name: sheet.name }
    localStorage.setItem(SELECTED_SHEET_KEY, JSON.stringify(entry))
    addSheet(entry)
    navigate('/diary', { replace: true })
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 bg-surface-container border-b border-outline-variant px-4 py-3">
        <h1 className="text-headline-sm font-bold text-primary">בחירת גיליון</h1>
        <p className="text-xs text-on-surface-variant mt-1">בחר את גיליון המצבת מרשימת Google Sheets שלך</p>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {isLoading && (
          <div className="text-center text-on-surface-variant py-12 font-mono text-sm">
            טוען גיליונות...
          </div>
        )}

        {error && (
          <div className="bg-error-container/30 border border-error/50 rounded-md p-4 text-error text-sm">
            שגיאה בטעינת גיליונות: {String(error)}
          </div>
        )}

        {sheets?.map(sheet => (
          <button
            key={sheet.id}
            onClick={() => selectSheet(sheet)}
            className="w-full text-right bg-surface-high border border-outline-variant rounded-md px-4 py-3
              hover:border-primary hover:bg-primary-container/20 active:bg-primary-container/40
              transition-colors flex items-center gap-3"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current text-primary shrink-0" aria-hidden="true">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/>
            </svg>
            <span className="flex-1 font-medium text-on-surface truncate">{sheet.name}</span>
            <span className="text-xs font-mono text-on-surface-variant shrink-0">{sheet.id.slice(-8)}</span>
          </button>
        ))}

        {sheets?.length === 0 && (
          <div className="text-center text-on-surface-variant py-12 text-sm">
            לא נמצאו גיליונות ב-Google Drive שלך
          </div>
        )}
      </div>

      {/* Change sheet link */}
      {getSelectedSheet() && (
        <div className="p-4 border-t border-outline-variant text-xs text-on-surface-variant text-center">
          גיליון נוכחי: <span className="font-mono text-primary">{getSelectedSheet()?.name}</span>
        </div>
      )}
    </div>
  )
}
