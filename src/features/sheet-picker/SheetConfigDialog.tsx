import { useEffect, useState } from 'react'
import { getSheetTabs, canEditSpreadsheet } from '@/data/sheetsClient'
import type { SelectedSheet } from './SheetPickerScreen'
import { useAuth } from '@/contexts/AuthContext'

interface Props {
  spreadsheetId: string
  spreadsheetName: string
  onConfirm: (entry: SelectedSheet) => void
  onCancel: () => void
}

export function SheetConfigDialog({ spreadsheetId, spreadsheetName, onConfirm, onCancel }: Props) {
  const { token } = useAuth()
  const [tabs, setTabs] = useState<string[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedTab, setSelectedTab] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [nameEdited, setNameEdited] = useState(false)
  const [readOnly, setReadOnly] = useState(false)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    async function load() {
      try {
        const [fetchedTabs, editAllowed] = await Promise.all([
          getSheetTabs(token!, spreadsheetId),
          canEditSpreadsheet(token!, spreadsheetId),
        ])
        if (cancelled) return
        setTabs(fetchedTabs)
        setCanEdit(editAllowed)
        setReadOnly(!editAllowed)
        const first = fetchedTabs[0] ?? ''
        setSelectedTab(first)
        setDisplayName(first ? `${spreadsheetName} / ${first}` : spreadsheetName)
      } catch (err) {
        if (!cancelled) setError(String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [token, spreadsheetId, spreadsheetName])

  useEffect(() => {
    if (!nameEdited && selectedTab) {
      setDisplayName(`${spreadsheetName} / ${selectedTab}`)
    }
  }, [selectedTab, spreadsheetName, nameEdited])

  function handleConfirm() {
    if (!selectedTab) return
    onConfirm({
      id: spreadsheetId,
      name: displayName.trim() || `${spreadsheetName} / ${selectedTab}`,
      tabName: selectedTab,
      readOnly: !canEdit || readOnly,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg bg-surface-container rounded-t-2xl p-5 space-y-4 max-h-[80vh] flex flex-col"
        dir="rtl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-title-md font-bold text-on-surface truncate">{spreadsheetName}</h2>
          <button
            onClick={onCancel}
            className="text-on-surface-variant hover:text-on-surface p-1 rounded"
            aria-label="סגור"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {loading && (
          <div className="text-center py-10 text-on-surface-variant text-sm font-mono">טוען...</div>
        )}

        {error && (
          <div className="text-error text-sm text-center py-4">{error}</div>
        )}

        {!loading && !error && (
          <div className="flex flex-col gap-4 overflow-y-auto">
            {/* Tab list */}
            <div>
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-2">בחר גיליון</p>
              <div className="space-y-1 max-h-44 overflow-y-auto">
                {tabs.map(tab => (
                  <button
                    key={tab}
                    onClick={() => setSelectedTab(tab)}
                    className={`w-full text-right px-3 py-2 rounded-md text-sm transition-colors
                      ${selectedTab === tab
                        ? 'bg-primary-container text-on-primary-container font-bold'
                        : 'hover:bg-surface-high text-on-surface'}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Display name */}
            <div>
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wide block mb-1">
                שם תצוגה
              </label>
              <input
                type="text"
                value={displayName}
                onChange={e => { setNameEdited(true); setDisplayName(e.target.value) }}
                dir="rtl"
                className="w-full bg-surface-high border border-outline-variant rounded-md px-3 py-2 text-sm
                  text-on-surface focus:outline-none focus:border-primary"
              />
            </div>

            {/* Readonly toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-on-surface">מצב קריאה בלבד</p>
                {!canEdit && (
                  <p className="text-xs text-on-surface-variant mt-0.5">אין הרשאות כתיבה</p>
                )}
              </div>
              <button
                role="switch"
                aria-checked={!canEdit || readOnly}
                disabled={!canEdit}
                onClick={() => canEdit && setReadOnly(r => !r)}
                className={`relative w-12 h-6 rounded-full transition-colors
                  ${(!canEdit || readOnly) ? 'bg-primary' : 'bg-outline-variant'}
                  ${!canEdit ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all
                  ${(!canEdit || readOnly) ? 'right-1' : 'left-1'}`}
                />
              </button>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleConfirm}
                disabled={!selectedTab}
                className="flex-1 bg-primary text-on-primary font-bold py-3 rounded-md hover:opacity-90
                  transition-opacity disabled:opacity-50"
              >
                הוסף ←
              </button>
              <button
                onClick={onCancel}
                className="px-5 py-3 text-on-surface-variant border border-outline-variant rounded-md
                  hover:bg-surface-high transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
