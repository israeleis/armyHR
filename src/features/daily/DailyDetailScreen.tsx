import { useState, useMemo, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { he } from 'date-fns/locale'
import { useDiaryData } from '@/features/diary/useDiaryData'
import { StatusBadge } from '@/components/StatusBadge'
import { StatusPicker } from './StatusPicker'
import { enqueueWrite } from '@/data/writeQueue'
import { getSnapshot, saveSnapshot, applyWriteToSnapshot } from '@/data/localCache'
import { getSelectedSheet } from '@/features/sheet-picker/SheetPickerScreen'
import type { StatusEntry, SoldierFields } from '@/domain/types'

interface EditingCell {
  entry: StatusEntry
  soldierId: string
  soldierName: string
}

const STATUS_GROUPS = [
  { id: 'present',  label: 'נוכח',        codes: new Set(['נ']) },
  { id: 'transit',  label: 'בתנועה',       codes: new Set(['י', 'ח', 'יח', 'חי', 'מ', 'פ', 'ל']) },
  { id: 'outside',  label: 'מחוץ ליחידה', codes: new Set(['ב', 'חול']) },
  { id: 'medical',  label: 'חריגים',       codes: new Set(['ג', 'ת']) },
]

// ─── Local sub-components ────────────────────────────────────────────────────

function CollapsibleSection({
  label, count, expanded, onToggle, dimmed = false, children,
}: {
  id: string; label: string; count: number; expanded: boolean
  onToggle: () => void; dimmed?: boolean; children: ReactNode
}) {
  return (
    <div className="bg-surface-container border border-outline-variant rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-4 py-3 hover:bg-surface-high transition-colors
          ${expanded ? 'border-r-2 border-primary' : ''}`}
      >
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${dimmed ? 'text-on-surface-variant' : 'text-on-surface'}`}>{label}</span>
          <span className="text-xs font-mono bg-primary-container text-on-primary-container rounded-full px-2 py-0.5">{count}</span>
        </div>
        <span className={`text-on-surface-variant text-lg transition-transform ${expanded ? 'rotate-90' : ''}`}>›</span>
      </button>
      {expanded && (
        <ul className="divide-y divide-outline-variant border-t border-outline-variant">
          {children}
        </ul>
      )}
    </div>
  )
}

function SoldierRow({
  soldier, code, entry, dimmed = false, onNavigate, onEdit,
}: {
  soldier: SoldierFields
  code: string
  entry: StatusEntry | undefined
  dimmed?: boolean
  onNavigate: () => void
  onEdit?: () => void
}) {
  const initials = soldier.name.trim().split(' ').map(w => w[0]).join('').slice(0, 2)
  const hasCode = !!code

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {/* Status badge — leading side in RTL layout (leftmost visual) */}
      {entry && onEdit ? (
        <button onClick={onEdit} aria-label="שנה סטטוס" className="shrink-0">
          <StatusBadge code={code} size="md" />
        </button>
      ) : hasCode ? (
        <span className="shrink-0">
          <StatusBadge code={code} size="md" />
        </span>
      ) : (
        <span className="shrink-0 text-xs text-outline font-mono">אין נתון</span>
      )}

      {/* Soldier info — takes remaining space, text aligned right */}
      <button onClick={onNavigate} className="flex-1 text-right min-w-0">
        <div className={`font-bold text-sm truncate ${dimmed ? 'text-on-surface-variant' : 'text-on-surface'}`}>
          {soldier.name}
        </div>
        {(soldier.rank || soldier.unit || (soldier.id && soldier.id !== soldier.name)) && (
          <div className="text-[10px] font-mono text-on-surface-variant">
            {[soldier.rank, soldier.unit, soldier.id !== soldier.name ? soldier.id : null]
              .filter(Boolean).join(' · ')}
          </div>
        )}
      </button>

      {/* Avatar circle — rightmost (trailing side in RTL) */}
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
        ${dimmed
          ? 'bg-surface-high text-on-surface-variant'
          : hasCode
            ? 'bg-primary-container text-on-primary-container'
            : 'bg-surface-high text-on-surface-variant'
        }`}>
        {initials}
      </div>

      {/* Navigation chevron */}
      <span className="text-outline text-lg shrink-0">›</span>
    </li>
  )
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export function DailyDetailScreen() {
  const { date: dateParam } = useParams<{ date: string }>()
  const navigate = useNavigate()
  const { data, isLoading, error } = useDiaryData()
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [localOverrides, setLocalOverrides] = useState<Map<string, string>>(new Map())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['present']))

  const sheet = getSelectedSheet()

  const dateObj = useMemo(() => {
    try { return dateParam ? parseISO(dateParam) : null } catch { return null }
  }, [dateParam])

  const dateLabel = dateObj
    ? format(dateObj, "EEEE, d בMMMM", { locale: he })
    : dateParam ?? ''

  const entriesForDate = useMemo(() => {
    if (!data || !dateParam) return []
    return data.statuses.filter(e => e.dateKey === dateParam)
  }, [data, dateParam])

  const entryBySoldierId = useMemo(() => {
    const map = new Map<string, StatusEntry>()
    for (const e of entriesForDate) map.set(e.soldierId, e)
    return map
  }, [entriesForDate])

  const stats = useMemo(() => {
    const total = data?.soldiers.length ?? 0
    let present = 0, transit = 0, anomalies = 0
    for (const e of entriesForDate) {
      const code = e.code
      if (STATUS_GROUPS[0].codes.has(code)) present++
      else if (STATUS_GROUPS[1].codes.has(code)) transit++
      else if (STATUS_GROUPS[3].codes.has(code)) anomalies++
    }
    return { total, present, transit, anomalies }
  }, [entriesForDate, data])

  const groupedSoldiers = useMemo(() => {
    if (!data) return []
    return STATUS_GROUPS.map(group => {
      const soldiers: Array<{ soldier: SoldierFields; entry: StatusEntry | undefined; code: string }> = []
      for (const soldier of data.soldiers) {
        const entry = entryBySoldierId.get(soldier.id)
        const code = entry?.code ?? ''
        if (group.codes.has(code)) {
          soldiers.push({ soldier, entry, code })
        }
      }
      return { ...group, soldiers }
    }).filter(g => g.soldiers.length > 0)
  }, [data, entryBySoldierId])

  // Soldiers not in any STATUS_GROUP:
  // - unknownCodeSoldiers: non-empty code the groups don't cover → show in "אחר"
  // - noStatusSoldiers:    empty / no entry for this date        → show in "ללא סטטוס"
  const { unknownCodeSoldiers, noStatusSoldiers } = useMemo(() => {
    if (!data) return { unknownCodeSoldiers: [] as SoldierFields[], noStatusSoldiers: [] as SoldierFields[] }
    const allGroupCodes = new Set(STATUS_GROUPS.flatMap(g => [...g.codes]))
    const unknown: SoldierFields[] = []
    const absent: SoldierFields[] = []
    for (const s of data.soldiers) {
      const entry = entryBySoldierId.get(s.id)
      const code = entry?.code ?? ''
      if (allGroupCodes.has(code)) continue
      if (code) unknown.push(s)
      else absent.push(s)
    }
    return { unknownCodeSoldiers: unknown, noStatusSoldiers: absent }
  }, [data, entryBySoldierId])

  function toggleGroup(id: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleStatusChange(entry: StatusEntry, newCode: string) {
    if (!sheet) return
    const overrideKey = `${entry.sourceCell.row}-${entry.sourceCell.col}`
    const oldCode = localOverrides.get(overrideKey) ?? entry.code
    setLocalOverrides(prev => new Map(prev).set(overrideKey, newCode))

    const sheetName = sheet.tabName
    const snap = await getSnapshot(sheet.id, sheetName)
    if (snap) {
      const updated = applyWriteToSnapshot(snap.rawValues, entry.sourceCell.row, entry.sourceCell.col, newCode)
      await saveSnapshot(sheet.id, sheetName, updated)
    }
    await enqueueWrite({ spreadsheetId: sheet.id, sheetName, row: entry.sourceCell.row, col: entry.sourceCell.col, oldValue: oldCode, newValue: newCode })
    setEditingCell(null)
  }

  const statBoxes = [
    { label: 'נוכח',   value: stats.present,   color: '#66ff33' },
    { label: 'כולל',   value: stats.total,      color: '#c3cc8c' },
    { label: 'חריגים', value: stats.anomalies,  color: '#f5cac3' },
    { label: 'בדרכים', value: stats.transit,    color: '#f4d35e' },
  ]

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-surface-container border-b border-outline-variant px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Back arrow + date label */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              aria-label="חזרה"
              className="text-on-surface hover:text-primary transition-colors"
            >
              {/* Back arrow (←) */}
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-base font-bold text-on-surface">{dateLabel}</h1>
          </div>

          {/* Search + Filter icons on the LEFT in visual RTL (right in DOM) */}
          <div className="flex items-center gap-3">
            {/* Search / magnifier */}
            <button aria-label="חיפוש" className="text-on-surface-variant hover:text-on-surface transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            {/* Filter / funnel */}
            <button aria-label="סינון" className="text-on-surface-variant hover:text-on-surface transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center text-on-surface-variant font-mono text-sm">טוען...</div>
      )}
      {error && (
        <div className="m-4 bg-error-container/30 border border-error/50 rounded-md p-4 text-error text-sm">{String(error)}</div>
      )}

      {data && (
        <div className="flex-1 overflow-y-auto">
          {/* Stats — 2×2 grid */}
          <div className="grid grid-cols-2 gap-3 p-4">
            {statBoxes.map(s => (
              <div
                key={s.label}
                className="bg-surface-container border border-outline-variant rounded-lg px-4 py-4 flex flex-col gap-1"
              >
                <div className="text-3xl font-bold leading-none" style={{ color: s.color }}>{s.value}</div>
                <div className="text-xs font-mono text-on-surface-variant mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Grouped sections */}
          <div className="px-4 space-y-2 pb-4">
            {groupedSoldiers.map(group => (
              <CollapsibleSection
                key={group.id}
                id={group.id}
                label={group.label}
                count={group.soldiers.length}
                expanded={expandedGroups.has(group.id)}
                onToggle={() => toggleGroup(group.id)}
              >
                {group.soldiers.map(({ soldier, entry, code: rawCode }) => {
                  const overrideKey = entry ? `${entry.sourceCell.row}-${entry.sourceCell.col}` : null
                  const code = (overrideKey && localOverrides.get(overrideKey)) ?? rawCode
                  return (
                    <SoldierRow
                      key={soldier.id}
                      soldier={soldier}
                      code={code}
                      entry={entry}
                      onNavigate={() => navigate(`/soldier/${encodeURIComponent(soldier.id)}`)}
                      onEdit={entry ? () => setEditingCell({ entry, soldierId: soldier.id, soldierName: soldier.name }) : undefined}
                    />
                  )
                })}
              </CollapsibleSection>
            ))}

            {/* Non-empty code not covered by any group */}
            {unknownCodeSoldiers.length > 0 && (
              <CollapsibleSection
                id="unknown"
                label="אחר"
                count={unknownCodeSoldiers.length}
                expanded={expandedGroups.has('unknown')}
                onToggle={() => toggleGroup('unknown')}
              >
                {unknownCodeSoldiers.map(soldier => {
                  const entry = entryBySoldierId.get(soldier.id)
                  const overrideKey = entry ? `${entry.sourceCell.row}-${entry.sourceCell.col}` : null
                  const code = (overrideKey && localOverrides.get(overrideKey)) ?? entry?.code ?? ''
                  return (
                    <SoldierRow
                      key={soldier.id}
                      soldier={soldier}
                      code={code}
                      entry={entry}
                      onNavigate={() => navigate(`/soldier/${encodeURIComponent(soldier.id)}`)}
                      onEdit={entry ? () => setEditingCell({ entry, soldierId: soldier.id, soldierName: soldier.name }) : undefined}
                    />
                  )
                })}
              </CollapsibleSection>
            )}

            {/* Truly absent — no entry or empty code for this date */}
            {noStatusSoldiers.length > 0 && (
              <CollapsibleSection
                id="absent"
                label="ללא סטטוס"
                count={noStatusSoldiers.length}
                expanded={expandedGroups.has('absent')}
                onToggle={() => toggleGroup('absent')}
                dimmed
              >
                {noStatusSoldiers.map(soldier => (
                  <SoldierRow
                    key={soldier.id}
                    soldier={soldier}
                    code=""
                    entry={undefined}
                    dimmed
                    onNavigate={() => navigate(`/soldier/${encodeURIComponent(soldier.id)}`)}
                  />
                ))}
              </CollapsibleSection>
            )}
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        aria-label="הוסף רשומה"
        className="fixed bottom-20 left-4 w-14 h-14 rounded-full bg-primary-container text-on-primary-container text-2xl font-bold shadow-lg flex items-center justify-center"
      >
        +
      </button>

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
