// src/features/transitions/TransitionsScreen.tsx
import { useMemo, useState, useRef, useEffect } from 'react'
import { format, startOfToday, isToday, addDays } from 'date-fns'
import { he } from 'date-fns/locale'
import { useTransitions } from './useTransitions'
import { getStatus } from '@/domain/statuses'
import { FilterPane } from '@/components/FilterPane'
import {
  emptyFilterState, activeFilterCount,
  buildFilterSections, applySoldierFilter,
  toggleMultiSelect, clearMultiKey, setTextFilter,
  type FilterState, type FilterSection,
} from '@/features/filters'
import type { TransitionEntry } from './useTransitions'

// ── Helpers ────────────────────────────────────────────────────────────────

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const TRANSITION_TYPE_SECTION: FilterSection = {
  key: 'transitionType',
  label: 'סוג פעולה',
  type: 'multiselect',
  options: ['פתיחה', 'סגירה'],
}

type GroupByKey = 'none' | 'transitionType' | 'unit' | 'team' | 'role' | 'rank'

const GROUP_BY_OPTIONS: Array<{ key: GroupByKey; label: string }> = [
  { key: 'none',           label: 'ללא'    },
  { key: 'transitionType', label: 'סוג'    },
  { key: 'unit',           label: 'יחידה'  },
  { key: 'team',           label: 'כיתה'   },
  { key: 'role',           label: 'תפקיד'  },
  { key: 'rank',           label: 'דרגה'   },
]

function getGroupLabel(entry: TransitionEntry, key: GroupByKey): string {
  switch (key) {
    case 'transitionType': return entry.types.includes('פתיחה') ? 'פתיחות' : 'סגירות'
    case 'unit':  return entry.soldier.unit  || 'ללא יחידה'
    case 'team':  return entry.soldier.team  || 'ללא כיתה'
    case 'role':  return entry.soldier.role  || 'ללא תפקיד'
    case 'rank':  return entry.soldier.rank  || 'ללא דרגה'
    default:      return ''
  }
}

// Expand entries so those with both types appear in each transitionType group.
function expandForGroupBy(entries: TransitionEntry[], groupBy: GroupByKey): TransitionEntry[] {
  if (groupBy !== 'transitionType') return entries
  const expanded: TransitionEntry[] = []
  for (const e of entries) {
    if (e.types.length === 2) {
      expanded.push({ ...e, types: ['פתיחה'] })
      expanded.push({ ...e, types: ['סגירה'] })
    } else {
      expanded.push(e)
    }
  }
  return expanded
}

function applyTransitionFilter(entries: TransitionEntry[], filterState: FilterState): TransitionEntry[] {
  const selectedTypes = filterState.multiSelect['transitionType'] ?? new Set<string>()
  return entries.filter(e => {
    if (selectedTypes.size > 0 && !e.types.some(t => selectedTypes.has(t))) return false
    return true
  })
}

// ── Entry row ──────────────────────────────────────────────────────────────

function EntryRow({ entry }: { entry: TransitionEntry }) {
  const statusName = getStatus(entry.statusCode)?.name ?? entry.statusCode
  const { soldier, types } = entry
  const initials = soldier.name.trim().split(' ').map(w => w[0]).join('').slice(0, 2)

  return (
    <div className="flex flex-row-reverse items-center gap-3 bg-surface-high border border-outline-variant rounded-md px-3 py-2.5">
      {/* Avatar */}
      <div className="shrink-0 w-9 h-9 rounded-full bg-primary-container flex items-center justify-center text-xs font-bold text-on-primary-container">
        {initials}
      </div>
      {/* Name / secondary */}
      <div className="flex-1 text-right min-w-0">
        <div className="text-sm font-bold text-on-surface truncate">
          {[soldier.rank, soldier.name].filter(Boolean).join(' ')}
        </div>
        {(soldier.unit || soldier.team) && (
          <div className="text-[10px] font-mono text-on-surface-variant">
            {[soldier.unit, soldier.team].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
      {/* Type chips + status */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <div className="flex gap-1">
          {types.includes('פתיחה') && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none" style={{ background: '#166534', color: '#bbf7d0' }}>
              פתיחה
            </span>
          )}
          {types.includes('סגירה') && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none" style={{ background: '#7f1d1d', color: '#fecaca' }}>
              סגירה
            </span>
          )}
        </div>
        <span className="text-[10px] font-mono text-on-surface-variant">{statusName}</span>
      </div>
    </div>
  )
}

// ── Main screen ────────────────────────────────────────────────────────────

export function TransitionsScreen() {
  const { transitions, dates, isLoading, error } = useTransitions()
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)
  const [filterState, setFilterState] = useState<FilterState>(emptyFilterState())
  const [filterOpen, setFilterOpen] = useState(false)
  const [groupBy, setGroupBy] = useState<GroupByKey>('none')
  const carouselRef = useRef<HTMLDivElement>(null)
  const today = startOfToday()

  const effectiveDates = dates.length > 0
    ? dates
    : Array.from({ length: 14 }, (_, i) => addDays(today, i - 7))

  const activeDate = useMemo(() => {
    if (selectedDateKey) {
      const found = effectiveDates.find(d => toDateKey(d) === selectedDateKey)
      if (found) return found
    }
    return effectiveDates.find(d => isToday(d)) ?? effectiveDates[effectiveDates.length - 1] ?? today
  }, [selectedDateKey, effectiveDates, today])

  const activeDateKey = toDateKey(activeDate)

  // Scroll carousel to active date
  useEffect(() => {
    if (!carouselRef.current) return
    const idx = effectiveDates.findIndex(d => toDateKey(d) === activeDateKey)
    if (idx < 0) return
    const el = carouselRef.current.children[idx] as HTMLElement | undefined
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [activeDateKey, effectiveDates])

  // Entries for the active date
  const dateEntries = useMemo(
    () => transitions.filter(e => e.dateKey === activeDateKey),
    [transitions, activeDateKey]
  )

  // Apply soldier filters (name, unit, team, etc.)
  const soldierFilteredEntries = useMemo(() => {
    const soldierFiltered = applySoldierFilter(
      dateEntries.map(e => e.soldier),
      filterState
    )
    const soldierIds = new Set(soldierFiltered.map(s => s.id))
    return dateEntries.filter(e => soldierIds.has(e.soldier.id))
  }, [dateEntries, filterState])

  // Apply transitionType filter
  const filteredEntries = useMemo(
    () => applyTransitionFilter(soldierFilteredEntries, filterState),
    [soldierFilteredEntries, filterState]
  )

  // Group
  const grouped = useMemo((): Array<{ key: string; entries: TransitionEntry[] }> => {
    if (groupBy === 'none') return [{ key: '', entries: filteredEntries }]
    const expanded = expandForGroupBy(filteredEntries, groupBy)
    const map = new Map<string, TransitionEntry[]>()
    for (const e of expanded) {
      const g = getGroupLabel(e, groupBy)
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(e)
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'he'))
      .map(([key, entries]) => ({ key, entries }))
  }, [filteredEntries, groupBy])

  // Filter sections for FilterPane (transitionType prepended)
  const soldiers = useMemo(() => transitions.map(e => e.soldier), [transitions])
  const filterSections = useMemo(
    () => [TRANSITION_TYPE_SECTION, ...buildFilterSections(soldiers)],
    [soldiers]
  )

  const filterCount = activeFilterCount(filterState)

  return (
    <div dir="rtl" className="flex flex-col flex-1 overflow-hidden bg-background">
      {/* ─── Filter/GroupBy toolbar ─── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-outline-variant overflow-x-auto no-scrollbar">
        {/* Filter button */}
        <button
          onClick={() => setFilterOpen(true)}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold border transition-colors
            ${filterCount > 0
              ? 'bg-primary-container text-on-primary-container border-primary/40'
              : 'bg-surface-high text-on-surface-variant border-transparent'}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          {filterCount > 0 ? `סינון (${filterCount})` : 'סינון'}
        </button>

        {/* Group-by pills */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {GROUP_BY_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setGroupBy(opt.key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-bold transition-colors
                ${groupBy === opt.key
                  ? 'bg-primary-container text-on-primary-container'
                  : 'bg-surface-high text-on-surface-variant'}`}
            >
              {opt.key === 'none' ? 'קיבוץ' : opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center text-on-surface-variant font-mono text-sm">
          טוען נתונים...
        </div>
      )}

      {error && (
        <div className="mx-4 mt-4 bg-error-container/30 border border-error/50 rounded-md p-4 text-error text-sm">
          {String(error)}
        </div>
      )}

      {!isLoading && !error && (
        <div className="flex-1 overflow-y-auto">
          {/* ─── Date carousel ─── */}
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">פתיחות וסגירות</span>
              <span className="text-xs font-mono text-on-surface-variant">
                {format(activeDate, 'yyyy', { locale: he })}
              </span>
            </div>
            <div
              ref={carouselRef}
              className="flex gap-2 overflow-x-auto no-scrollbar pb-1"
              style={{ direction: 'rtl' }}
            >
              {effectiveDates.map(date => {
                const dk = toDateKey(date)
                const active = dk === activeDateKey
                const todayDate = isToday(date)
                const count = transitions.filter(e => e.dateKey === dk).length
                return (
                  <button
                    key={dk}
                    onClick={() => setSelectedDateKey(dk)}
                    className={`shrink-0 flex flex-col items-center justify-center rounded-md transition-all
                      ${active
                        ? 'w-[80px] h-[80px] bg-primary-container border border-primary/60'
                        : todayDate
                          ? 'w-[60px] h-[68px] bg-surface-high border border-primary/40'
                          : 'w-[60px] h-[68px] bg-surface-high border border-transparent'}`}
                  >
                    <span className={`text-[10px] font-mono uppercase mb-0.5 ${active ? 'text-on-primary-container' : 'text-on-surface-variant'}`}>
                      {format(date, 'EEE', { locale: he })}
                    </span>
                    <span className={`font-bold leading-none ${active ? 'text-xl text-on-primary-container' : 'text-sm text-on-surface'}`}>
                      {format(date, 'd.MM')}
                    </span>
                    {count > 0 && (
                      <span className={`text-[9px] font-bold mt-0.5 ${active ? 'text-on-primary-container/80' : 'text-primary'}`}>
                        {count}
                      </span>
                    )}
                    {todayDate && count === 0 && (
                      <span className={`text-[8px] font-bold mt-0.5 ${active ? 'text-on-primary-container' : 'text-primary'}`}>
                        היום
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ─── Transitions for active date ─── */}
          <div className="px-4 pb-4">
            {/* Date section header */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono text-on-surface-variant">
                {filteredEntries.length > 0 ? `${filteredEntries.length} פעולות` : ''}
              </span>
              <span className="text-sm font-bold text-on-surface">
                {format(activeDate, 'EEEE, d בMMMM', { locale: he })}
              </span>
            </div>

            {filteredEntries.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-on-surface-variant">אין פעולות</p>
              </div>
            ) : (
              <div className="space-y-4">
                {grouped.map(group => (
                  <div key={group.key}>
                    {groupBy !== 'none' && (
                      <div className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2 text-right">
                        {group.key} ({group.entries.length})
                      </div>
                    )}
                    <div className="space-y-1.5">
                      {group.entries.map((entry, i) => (
                        <EntryRow key={`${entry.soldier.id}-${entry.types.join(',')}-${i}`} entry={entry} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Filter pane ─── */}
      <FilterPane
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        sections={filterSections}
        multiSelect={filterState.multiSelect}
        text={filterState.text}
        onMultiToggle={(key, value) => setFilterState(s => toggleMultiSelect(s, key, value))}
        onMultiClear={key => setFilterState(s => clearMultiKey(s, key))}
        onTextChange={(key, value) => setFilterState(s => setTextFilter(s, key, value))}
        onClearAll={() => setFilterState(emptyFilterState())}
      />
    </div>
  )
}
