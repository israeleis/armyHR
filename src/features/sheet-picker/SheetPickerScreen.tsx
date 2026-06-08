import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import {
  listUserSheets,
  searchSheets,
  type SheetFile,
} from '@/data/sheetsClient'
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

type Mode = 'recent' | 'search' | 'browse' | 'paste'

function SheetRow({ sheet, onSelect }: { sheet: SheetFile; onSelect: (s: SheetFile) => void }) {
  return (
    <button
      onClick={() => onSelect(sheet)}
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
  )
}

export function SheetPickerScreen() {
  const { token, isSignedIn } = useAuth()
  const navigate = useNavigate()
  const { addSheet } = useSheetHistory()

  const [mode, setMode] = useState<Mode>('recent')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [, setFolderStack] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    if (!isSignedIn) navigate('/signin', { replace: true })
  }, [isSignedIn, navigate])

  // 400ms debounce for search
  useEffect(() => {
    if (!searchQuery) {
      setDebouncedQuery('')
      setMode('recent')
      return
    }
    setMode('search')
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 400)
    return () => clearTimeout(t)
  }, [searchQuery])

  const { data: recentSheets, isLoading: recentLoading, error: recentError } = useQuery({
    queryKey: ['sheets', token],
    queryFn: () => listUserSheets(token!),
    enabled: !!token,
    staleTime: 1000 * 60 * 5,
  })

  const {
    data: searchResults,
    isLoading: searchLoading,
    error: searchError,
  } = useQuery({
    queryKey: ['search-sheets', token, debouncedQuery],
    queryFn: () => searchSheets(token!, debouncedQuery),
    enabled: !!token && debouncedQuery.length > 0,
    staleTime: 0,
  })

  function selectSheet(sheet: SheetFile) {
    const entry = { id: sheet.id, name: sheet.name }
    localStorage.setItem(SELECTED_SHEET_KEY, JSON.stringify(entry))
    addSheet(entry)
    navigate('/diary', { replace: true })
  }

  const isSearchPending = searchQuery.length > 0 && debouncedQuery !== searchQuery

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-background" dir="rtl">
      {/* Header with search */}
      <header className="sticky top-0 z-10 bg-surface-container border-b border-outline-variant px-4 pt-3 pb-3">
        <h1 className="text-headline-sm font-bold text-primary mb-2">בחירת גיליון</h1>
        <div className="relative">
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="חפש גיליון..."
            dir="rtl"
            className="w-full bg-surface-high border border-outline-variant rounded-md pr-9 pl-3 py-2 text-sm
              text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
              aria-label="נקה חיפוש"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">

        {/* ── SEARCH MODE ── */}
        {mode === 'search' && (
          <>
            {(isSearchPending || searchLoading) && (
              <div className="text-center text-on-surface-variant py-8 font-mono text-sm">מחפש...</div>
            )}
            {searchError && (
              <div className="bg-error-container/30 border border-error/50 rounded-md p-3 text-error text-sm text-right">
                שגיאה בחיפוש: {String(searchError)}
              </div>
            )}
            {!isSearchPending && !searchLoading && searchResults?.sheets.length === 0 && (
              <div className="text-center text-on-surface-variant py-12 text-sm">
                לא נמצאו גיליונות עבור ״{debouncedQuery}״
              </div>
            )}
            {!isSearchPending && searchResults?.sheets.map(sheet => (
              <SheetRow key={sheet.id} sheet={sheet} onSelect={selectSheet} />
            ))}
          </>
        )}

        {/* ── RECENT MODE ── */}
        {mode === 'recent' && (
          <>
            {recentLoading && (
              <div className="text-center text-on-surface-variant py-12 font-mono text-sm">
                טוען גיליונות...
              </div>
            )}
            {recentError && (
              <div className="bg-error-container/30 border border-error/50 rounded-md p-4 text-error text-sm">
                שגיאה בטעינת גיליונות: {String(recentError)}
              </div>
            )}
            {recentSheets?.map(sheet => (
              <SheetRow key={sheet.id} sheet={sheet} onSelect={selectSheet} />
            ))}
            {recentSheets?.length === 0 && (
              <div className="text-center text-on-surface-variant py-12 text-sm">
                לא נמצאו גיליונות ב-Google Drive שלך
              </div>
            )}
            {/* Footer action buttons — browse & paste */}
            {!recentLoading && (
              <div className="pt-4 border-t border-outline-variant space-y-1 text-right">
                <p className="text-xs text-on-surface-variant mb-3">אפשרויות נוספות</p>
                {/* Browse button — placeholder for Task 3 */}
                <button
                  onClick={() => { setMode('browse'); setFolderStack([]) }}
                  className="w-full text-right text-sm font-bold text-primary py-3 flex items-center gap-2"
                >
                  <span>📁</span> עיין בתיקיות Drive
                </button>
                {/* Paste button — placeholder for Task 4 */}
                <button
                  onClick={() => setMode('paste')}
                  className="w-full text-right text-sm font-bold text-primary py-3 flex items-center gap-2"
                >
                  <span>🔗</span> הדבק קישור לגיליון
                </button>
              </div>
            )}
          </>
        )}

        {/* ── BROWSE MODE placeholder ── (implemented in Task 3) */}
        {mode === 'browse' && (
          <div className="text-center text-on-surface-variant py-12 text-sm">
            מצב עיון — יושם בשלב הבא
          </div>
        )}

        {/* ── PASTE MODE placeholder ── (implemented in Task 4) */}
        {mode === 'paste' && (
          <div className="text-center text-on-surface-variant py-12 text-sm">
            מצב הדבקת קישור — יושם בשלב הבא
          </div>
        )}

      </div>

      {getSelectedSheet() && (
        <div className="p-4 border-t border-outline-variant text-xs text-on-surface-variant text-center">
          גיליון נוכחי: <span className="font-mono text-primary">{getSelectedSheet()?.name}</span>
        </div>
      )}
    </div>
  )
}
