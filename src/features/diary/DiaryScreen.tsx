import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format, addDays, startOfToday, isToday } from 'date-fns'
import { he } from 'date-fns/locale'
import { useDiaryData } from './useDiaryData'
import { StatusBadge } from '@/components/StatusBadge'
import { useAuth } from '@/contexts/AuthContext'
import { getSelectedSheet } from '@/features/sheet-picker/SheetPickerScreen'

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function DiaryScreen() {
  const { isSignedIn, signOut } = useAuth()
  const { data, isLoading, error } = useDiaryData()
  const navigate = useNavigate()
  const sheet = getSelectedSheet()
  const [selectedUnit, setSelectedUnit] = useState<string>('הכל')

  // Date range: 3 days back to 10 days forward
  const today = startOfToday()
  const dates = Array.from({ length: 14 }, (_, i) => addDays(today, i - 3))

  // Unique units
  const units = useMemo(() => {
    if (!data) return []
    return ['הכל', ...new Set(data.soldiers.map(s => s.unit).filter(Boolean) as string[])]
  }, [data])

  // Filter soldiers by unit
  const filteredSoldiers = useMemo(() => {
    if (!data) return []
    if (selectedUnit === 'הכל') return data.soldiers
    return data.soldiers.filter(s => s.unit === selectedUnit)
  }, [data, selectedUnit])

  // Status counts per date key
  const countsByDate = useMemo(() => {
    if (!data) return new Map<string, Record<string, number>>()
    const map = new Map<string, Record<string, number>>()
    const filteredIds = new Set(filteredSoldiers.map(s => s.id))
    for (const entry of data.statuses) {
      if (!filteredIds.has(entry.soldierId)) continue
      if (!entry.code) continue
      const counts = map.get(entry.dateKey) ?? {}
      counts[entry.code] = (counts[entry.code] ?? 0) + 1
      map.set(entry.dateKey, counts)
    }
    return map
  }, [data, filteredSoldiers])

  if (!isSignedIn) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
        <p className="text-on-surface-variant text-sm">נדרשת כניסה</p>
        <Link to="/signin" className="text-primary font-bold underline">כניסה</Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen pb-16">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-surface-container border-b border-outline-variant px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-headline-sm font-bold text-primary">יומן מצבת</h1>
          {sheet && <p className="text-xs font-mono text-on-surface-variant truncate max-w-[200px]">{sheet.name}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/sheets')}
            className="text-xs text-on-surface-variant hover:text-primary px-2 py-1"
            aria-label="שנה גיליון"
          >
            שנה גיליון
          </button>
          <button
            onClick={signOut}
            className="text-xs text-error hover:opacity-80 px-2 py-1"
            aria-label="יציאה"
          >
            יציאה
          </button>
        </div>
      </header>

      {/* Unit filter */}
      {units.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 py-2 border-b border-outline-variant no-scrollbar">
          {units.map(unit => (
            <button
              key={unit}
              onClick={() => setSelectedUnit(unit)}
              className={`shrink-0 px-3 py-1 rounded-full text-sm font-bold transition-colors
                ${selectedUnit === unit
                  ? 'bg-primary-container text-on-primary-container'
                  : 'bg-surface-high text-on-surface-variant'}`}
            >
              {unit}
            </button>
          ))}
        </div>
      )}

      {/* Loading / error states */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center text-on-surface-variant font-mono text-sm">
          טוען נתוני מצבת...
        </div>
      )}

      {error && (
        <div className="mx-4 mt-4 bg-error-container/30 border border-error/50 rounded-md p-4 text-error text-sm">
          {String(error)}
        </div>
      )}

      {/* Date timeline */}
      {data && (
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-1 p-2">
            {dates.map(date => {
              const dk = toDateKey(date)
              const counts = countsByDate.get(dk) ?? {}
              const todayStyle = isToday(date)

              return (
                <button
                  key={dk}
                  onClick={() => navigate(`/diary/${dk}`)}
                  className={`w-full text-right flex items-center gap-3 px-4 py-3 rounded-md transition-colors
                    ${todayStyle
                      ? 'bg-primary-container/40 border border-primary/60'
                      : 'bg-surface-high hover:bg-surface-bright'}`}
                >
                  {/* Date */}
                  <div className="shrink-0 text-center min-w-[56px]">
                    <div className={`text-label-caps font-mono ${todayStyle ? 'text-primary' : 'text-on-surface-variant'}`}>
                      {format(date, 'EEE', { locale: he })}
                    </div>
                    <div className={`text-lg font-bold leading-none ${todayStyle ? 'text-primary' : 'text-on-surface'}`}>
                      {format(date, 'd/M')}
                    </div>
                    {todayStyle && <div className="text-[10px] text-primary font-bold mt-0.5">היום</div>}
                  </div>

                  {/* Status summary */}
                  <div className="flex-1 flex flex-wrap gap-1 justify-end">
                    {Object.keys(counts).length === 0 ? (
                      <span className="text-xs text-on-surface-variant">אין נתונים</span>
                    ) : (
                      Object.entries(counts)
                        .sort(([a], [b]) => b.localeCompare(a))
                        .slice(0, 5)
                        .map(([code, count]) => (
                          <div key={code} className="flex items-center gap-1">
                            <StatusBadge code={code} size="sm" />
                            <span className="text-xs font-mono text-on-surface-variant">{count}</span>
                          </div>
                        ))
                    )}
                  </div>

                  <span className="text-outline shrink-0 text-lg">›</span>
                </button>
              )
            })}
          </div>

          {/* Recent changes placeholder */}
          <div className="mx-4 mb-4 mt-2 p-4 bg-surface-high rounded-md border border-outline-variant">
            <h2 className="text-sm font-bold text-on-surface-variant mb-2">שינויים אחרונים</h2>
            <p className="text-xs text-outline font-mono">אין שינויים אחרונים</p>
          </div>
        </div>
      )}
    </div>
  )
}
