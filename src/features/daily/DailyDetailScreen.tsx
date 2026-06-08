import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { he } from 'date-fns/locale'
import { useDiaryData } from '@/features/diary/useDiaryData'
import { StatusBadge } from '@/components/StatusBadge'
import { StatusPicker } from './StatusPicker'
import { enqueueWrite } from '@/data/writeQueue'
import { getSnapshot, saveSnapshot, applyWriteToSnapshot } from '@/data/localCache'
import { getSelectedSheet } from '@/features/sheet-picker/SheetPickerScreen'
import type { StatusEntry } from '@/domain/types'

interface EditingCell {
  entry: StatusEntry
  soldierId: string
  soldierName: string
}

export function DailyDetailScreen() {
  const { date: dateParam } = useParams<{ date: string }>()
  const navigate = useNavigate()
  const { data, isLoading, error } = useDiaryData()
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [localOverrides, setLocalOverrides] = useState<Map<string, string>>(new Map())

  const sheet = getSelectedSheet()

  const dateObj = useMemo(() => {
    try { return dateParam ? parseISO(dateParam) : null } catch { return null }
  }, [dateParam])

  const dateLabel = dateObj
    ? format(dateObj, "EEEE, d בMMMM yyyy", { locale: he })
    : dateParam ?? ''

  // Get status entries for this date
  const entriesForDate = useMemo(() => {
    if (!data || !dateParam) return []
    return data.statuses.filter(e => e.dateKey === dateParam)
  }, [data, dateParam])

  // Map soldier id → entry for this date
  const entryBySoldierId = useMemo(() => {
    const map = new Map<string, StatusEntry>()
    for (const e of entriesForDate) map.set(e.soldierId, e)
    return map
  }, [entriesForDate])

  async function handleStatusChange(entry: StatusEntry, newCode: string) {
    if (!sheet) return
    const overrideKey = `${entry.sourceCell.row}-${entry.sourceCell.col}`
    const oldCode = localOverrides.get(overrideKey) ?? entry.code

    // Optimistic update
    setLocalOverrides(prev => new Map(prev).set(overrideKey, newCode))

    const sheetName = 'Sheet1'  // TODO: get from cache schema or sheet metadata

    // Update cache
    const snap = await getSnapshot(sheet.id, sheetName)
    if (snap) {
      const updated = applyWriteToSnapshot(snap.rawValues, entry.sourceCell.row, entry.sourceCell.col, newCode)
      await saveSnapshot(sheet.id, sheetName, updated)
    }

    // Enqueue write
    await enqueueWrite({
      spreadsheetId: sheet.id,
      sheetName,
      row: entry.sourceCell.row,
      col: entry.sourceCell.col,
      oldValue: oldCode,
      newValue: newCode,
    })

    setEditingCell(null)
  }

  return (
    <div className="flex flex-col min-h-screen pb-16">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-surface-container border-b border-outline-variant px-4 py-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-primary mb-1"
          aria-label="חזרה"
        >
          ‹ חזרה
        </button>
        <h1 className="text-headline-sm font-bold text-on-surface">{dateLabel}</h1>
        <p className="text-xs font-mono text-on-surface-variant">
          {entriesForDate.length} חיילים
        </p>
      </header>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center text-on-surface-variant font-mono text-sm">
          טוען...
        </div>
      )}

      {error && (
        <div className="m-4 bg-error-container/30 border border-error/50 rounded-md p-4 text-error text-sm">
          {String(error)}
        </div>
      )}

      {data && (
        <div className="flex-1 overflow-y-auto">
          <ul className="divide-y divide-outline-variant">
            {data.soldiers.map(soldier => {
              const entry = entryBySoldierId.get(soldier.id)
              const overrideKey = entry ? `${entry.sourceCell.row}-${entry.sourceCell.col}` : null
              const code = (overrideKey && localOverrides.get(overrideKey)) ?? entry?.code ?? ''

              return (
                <li key={soldier.id} className="flex items-center gap-3 px-4 py-3">
                  {/* Soldier info */}
                  <button
                    onClick={() => navigate(`/soldier/${encodeURIComponent(soldier.id)}`)}
                    className="flex-1 text-right"
                    aria-label={`פתח פרופיל של ${soldier.name}`}
                  >
                    <div className="font-bold text-on-surface text-sm">{soldier.name}</div>
                    {(soldier.rank || soldier.unit) && (
                      <div className="text-xs font-mono text-on-surface-variant mt-0.5">
                        {[soldier.rank, soldier.unit, soldier.team].filter(Boolean).join(' • ')}
                      </div>
                    )}
                  </button>

                  {/* Status badge (tappable) */}
                  {entry ? (
                    <button
                      onClick={() => setEditingCell({ entry, soldierId: soldier.id, soldierName: soldier.name })}
                      aria-label={`שנה סטטוס של ${soldier.name}`}
                    >
                      <StatusBadge code={code} size="md" />
                    </button>
                  ) : (
                    <span className="text-xs text-outline font-mono">אין נתון</span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Status picker overlay */}
      {editingCell && (
        <StatusPicker
          currentCode={
            localOverrides.get(`${editingCell.entry.sourceCell.row}-${editingCell.entry.sourceCell.col}`) ??
            editingCell.entry.code
          }
          onSelect={(code) => handleStatusChange(editingCell.entry, code)}
          onClose={() => setEditingCell(null)}
        />
      )}
    </div>
  )
}
