// src/features/transitions/TransitionsScreen.tsx
import { useMemo, useState, useRef, useEffect } from 'react'
import { format, startOfToday, isToday, addDays } from 'date-fns'
import { he } from 'date-fns/locale'
import { useTransitions } from './useTransitions'
import { getStatus } from '@/domain/statuses'
import { FilterPane, CollapsibleSection } from '@/components/FilterPane'
import {
  emptyFilterState, isFilterActive, activeFilterCount,
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

type GroupByKey = 'transitionType' | 'unit' | 'team' | 'role' | 'rank'

const GROUP_BY_OPTIONS: Array<{ key: GroupByKey; label: string }> = [
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
  }
}

// Expand entries so those with both types appear in each transitionType group.
function expandForGroupBy(entries: TransitionEntry[], groupBy: GroupByKey | null): TransitionEntry[] {
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

function FilterIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke={active ? 'var(--color-primary)' : 'currentColor'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  )
}

// ── Entry row ──────────────────────────────────────────────────────────────

function EntryRow({ entry }: { entry: TransitionEntry }) {
  const statusName = getStatus(entry.statusCode)?.name ?? entry.statusCode
  const { soldier, types } = entry
  const initials = soldier.name.trim().split(' ').map(w => w[0]).join('').slice(0, 2)

  return (
    <div className="flex flex-row-reverse items-center gap-3 bg-surface-high border border-outline-variant rounded-md px-3 py-2.5">
      <div className="shrink-0 w-9 h-9 rounded-full bg-primary-container flex items-center justify-center text-xs font-bold text-on-primary-container">
        {initials}
      </div>
      <div className="flex-1 text-right min-w-0">
        <div className="text-sm font-bold text-on-surface truncate">
          {[soldier.rank, soldier.name].filter(Boolean).join(' ')}
        </div>
        <div className="text-[10px] font-mono text-on-surface-variant">
          {[soldier.id, soldier.unit, soldier.team].filter(Boolean).join(' · ')}
        </div>
      </div>
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
  const [groupBy, setGroupBy] = useState<GroupByKey | null>(null)
  const carouselRef = useRef<HTMLDivElement>(null)
  const today = startOfToday()

  const effectiveDates = dates.length > 0
    ? dates
    : Array.from({ length: 15 }, (_, i) => addDays(today, i - 7))

  const activeDate = useMemo(() => {
    if (selectedDateKey) {
      const found = effectiveDates.find(d => toDateKey(d) === selectedDateKey)
      if (found) return found
    }
    return effectiveDates.find(d => isToday(d)) ?? effectiveDates[effectiveDates.length - 1] ?? today
  }, [selectedDateKey, effectiveDates, today])

  const activeDateKey = toDateKey(activeDate)

  useEffect(() => {
    if (!carouselRef.current) return
    const idx = effectiveDates.findIndex(d => toDateKey(d) === activeDateKey)
    if (idx < 0) return
    const el = carouselRef.current.children[idx] as HTMLElement | undefined
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [activeDateKey, effectiveDates])

  // Apply all filters across all dates — used for carousel counts and active date display
  const allFilteredTransitions = useMemo(() => {
    const { transitionType: _, ...restMulti } = filterState.multiSelect
    const soldierOnlyState = { ...filterState, multiSelect: restMulti }
    const soldierFiltered = applySoldierFilter(transitions.map(e => e.soldier), soldierOnlyState)
    const soldierIds = new Set(soldierFiltered.map(s => s.id))
    return applyTransitionFilter(
      transitions.filter(e => soldierIds.has(e.soldier.id)),
      filterState
    )
  }, [transitions, filterState])

  // Per-date count after filters (drives carousel dimming and badges)
  const countByDate = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of allFilteredTransitions) map.set(e.dateKey, (map.get(e.dateKey) ?? 0) + 1)
    return map
  }, [allFilteredTransitions])

  const filteredEntries = useMemo(
    () => allFilteredTransitions.filter(e => e.dateKey === activeDateKey),
    [allFilteredTransitions, activeDateKey]
  )

  const grouped = useMemo((): Array<{ key: string; entries: TransitionEntry[] }> => {
    if (!groupBy) return [{ key: '', entries: filteredEntries }]
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

  const soldiers = useMemo(() => transitions.map(e => e.soldier), [transitions])
  const filterSections = useMemo(
    () => [TRANSITION_TYPE_SECTION, ...buildFilterSections(soldiers)],
    [soldiers]
  )

  const filterActive = isFilterActive(filterState)
  const filterCount = activeFilterCount(filterState)
  const hasGroupBy = groupBy !== null

  return (
    <>
      <FilterPane
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        sections={filterSections}
        multiSelect={filterState.multiSelect}
        text={filterState.text}
        onMultiToggle={(key, value) => setFilterState(s => toggleMultiSelect(s, key, value))}
        onMultiClear={key => setFilterState(s => clearMultiKey(s, key))}
        onTextChange={(key, value) => setFilterState(s => setTextFilter(s, key, value))}
        onClearAll={() => { setFilterState(emptyFilterState()); setGroupBy(null) }}
      >
        <CollapsibleSection label="קיבוץ לפי" badge={hasGroupBy ? 1 : undefined}>
          {groupBy && (
            <div className="flex items-center gap-2 bg-primary-container rounded-md px-3 py-2 mb-3">
              <span className="text-sm font-medium text-on-primary-container flex-1">
                {GROUP_BY_OPTIONS.find(o => o.key === groupBy)?.label}
              </span>
              <button
                onClick={() => setGroupBy(null)}
                className="text-on-primary-container/70 hover:text-on-primary-container text-base leading-none"
              >
                ×
              </button>
            </div>
          )}
          {!groupBy && (
            <div className="flex flex-wrap gap-1.5">
              {GROUP_BY_OPTIONS.map(opt => (
                <button key={opt.key} onClick={() => setGroupBy(opt.key)}
                  className="px-3 py-1.5 rounded-md text-sm font-medium bg-surface-high text-on-surface-variant hover:text-on-surface transition-colors">
                  + {opt.label}
                </button>
              ))}
            </div>
          )}
        </CollapsibleSection>
      </FilterPane>

      <div dir="rtl" className="flex flex-col flex-1 overflow-hidden bg-background">
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
                <button
                  onClick={() => setFilterOpen(true)}
                  className="relative flex items-center justify-center w-[36px] h-[36px] rounded-md hover:bg-surface-high transition-colors text-on-surface-variant"
                  aria-label="פתח סינון"
                >
                  <FilterIcon active={filterActive || hasGroupBy} />
                  {(filterActive || hasGroupBy) && (
                    <span className="absolute -top-0.5 -left-0.5 min-w-[16px] h-4 rounded-full bg-primary text-on-primary text-[9px] font-bold flex items-center justify-center px-0.5">
                      {filterCount + (hasGroupBy ? 1 : 0)}
                    </span>
                  )}
                </button>
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
                  const count = countByDate.get(dk) ?? 0
                  return (
                    <button
                      key={dk}
                      onClick={() => setSelectedDateKey(dk)}
                      className={`shrink-0 flex flex-col items-center justify-center rounded-md transition-all
                        ${active
                          ? 'w-[80px] h-[80px] bg-primary-container border border-primary/60'
                          : todayDate
                            ? 'w-[60px] h-[68px] bg-surface-high border border-primary/40'
                            : count === 0
                              ? 'w-[60px] h-[68px] opacity-35 border border-transparent'
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
                      {groupBy && (
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
      </div>
    </>
  )
}
