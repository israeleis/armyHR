// src/features/transitions/TransitionsScreen.tsx
import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
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

// Expand dual-type entries into two when grouping by transitionType.
function expandForType(entries: TransitionEntry[]): TransitionEntry[] {
  const result: TransitionEntry[] = []
  for (const e of entries) {
    if (e.types.length === 2) {
      result.push({ ...e, types: ['פתיחה'] })
      result.push({ ...e, types: ['סגירה'] })
    } else {
      result.push(e)
    }
  }
  return result
}

function applyTransitionFilter(entries: TransitionEntry[], filterState: FilterState): TransitionEntry[] {
  const selectedTypes = filterState.multiSelect['transitionType'] ?? new Set<string>()
  return entries.filter(e =>
    selectedTypes.size === 0 || e.types.some(t => selectedTypes.has(t))
  )
}

// ── Flat list for grouped rendering ───────────────────────────────────────

type FlatHeader = { type: 'header'; title: string; depth: number; count: number; path: string }
type FlatEntry  = { type: 'entry';  entry: TransitionEntry; depth: number }
type FlatItem   = FlatHeader | FlatEntry

function buildFlatItems(
  entries: TransitionEntry[],
  keys: GroupByKey[],
  depth = 0,
  parentPath = '',
): FlatItem[] {
  if (keys.length === 0) {
    return entries.map(e => ({ type: 'entry' as const, entry: e, depth }))
  }
  const [key, ...rest] = keys
  const work = key === 'transitionType' ? expandForType(entries) : entries
  const map = new Map<string, TransitionEntry[]>()
  for (const e of work) {
    const val = getGroupLabel(e, key)
    if (!map.has(val)) map.set(val, [])
    map.get(val)!.push(e)
  }
  const result: FlatItem[] = []
  for (const [title, group] of [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'he'))) {
    const path = parentPath ? `${parentPath}||${title}` : title
    result.push({ type: 'header', title, depth, count: group.length, path })
    result.push(...buildFlatItems(group, rest, depth + 1, path))
  }
  return result
}

function applyCollapse(
  items: FlatItem[],
  expanded: Set<string>,
): Array<FlatItem & { isExpanded?: boolean }> {
  const result: Array<FlatItem & { isExpanded?: boolean }> = []
  let collapsedDepth: number | null = null
  for (const item of items) {
    if (collapsedDepth !== null) {
      if (item.type === 'header' && item.depth <= collapsedDepth) collapsedDepth = null
      else continue
    }
    if (item.type === 'header') {
      const isExpanded = expanded.has(item.path)
      result.push({ ...item, isExpanded })
      if (!isExpanded) collapsedDepth = item.depth
    } else {
      result.push(item)
    }
  }
  return result
}

// ── Icons ──────────────────────────────────────────────────────────────────

function FilterIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke={active ? 'var(--color-primary)' : 'currentColor'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform 150ms', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}

function ArrowUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15"/>
    </svg>
  )
}

function ArrowDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}

// ── Entry row ──────────────────────────────────────────────────────────────

function EntryRow({ entry, indent }: { entry: TransitionEntry; indent: number }) {
  const statusName = getStatus(entry.statusCode)?.name ?? entry.statusCode
  const { soldier, types } = entry
  const initials = soldier.name.trim().split(' ').map(w => w[0]).join('').slice(0, 2)

  return (
    <div
      className="flex flex-row-reverse items-center gap-3 bg-surface-high border border-outline-variant rounded-md px-3 py-2.5"
      style={{ marginRight: indent * 12 }}
    >
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
  const [groupByKeys, setGroupByKeys] = useState<GroupByKey[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const carouselRef = useRef<HTMLDivElement>(null)
  const today = startOfToday()

  useEffect(() => { setExpanded(new Set()) }, [groupByKeys])

  const toggleExpanded = useCallback((path: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }, [])

  const addGroupKey    = useCallback((k: GroupByKey) => setGroupByKeys(p => [...p, k]), [])
  const removeGroupKey = useCallback((k: GroupByKey) => setGroupByKeys(p => p.filter(x => x !== k)), [])
  const moveGroupKey   = useCallback((idx: number, dir: -1 | 1) => setGroupByKeys(p => {
    const next = [...p]
    const to = idx + dir
    if (to < 0 || to >= next.length) return p
    ;[next[idx], next[to]] = [next[to], next[idx]]
    return next
  }), [])

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

  // Apply all filters across all dates (for carousel counts + active date display)
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

  const countByDate = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of allFilteredTransitions) map.set(e.dateKey, (map.get(e.dateKey) ?? 0) + 1)
    return map
  }, [allFilteredTransitions])

  const filteredEntries = useMemo(
    () => allFilteredTransitions.filter(e => e.dateKey === activeDateKey),
    [allFilteredTransitions, activeDateKey]
  )

  const flatItems = useMemo(
    () => buildFlatItems(filteredEntries, groupByKeys),
    [filteredEntries, groupByKeys]
  )

  const visibleItems = useMemo(
    () => groupByKeys.length > 0 ? applyCollapse(flatItems, expanded) : flatItems,
    [flatItems, expanded, groupByKeys.length]
  )

  const soldiers = useMemo(() => transitions.map(e => e.soldier), [transitions])
  const filterSections = useMemo(
    () => [TRANSITION_TYPE_SECTION, ...buildFilterSections(soldiers)],
    [soldiers]
  )

  const filterActive = isFilterActive(filterState)
  const filterCount  = activeFilterCount(filterState)
  const hasGroupBy   = groupByKeys.length > 0
  const available    = GROUP_BY_OPTIONS.filter(o => !groupByKeys.includes(o.key))

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
        onClearAll={() => { setFilterState(emptyFilterState()); setGroupByKeys([]) }}
      >
        <CollapsibleSection label="קיבוץ לפי" badge={groupByKeys.length || undefined}>
          {groupByKeys.length > 0 && (
            <div className="space-y-1 mb-3">
              {groupByKeys.map((key, idx) => {
                const opt = GROUP_BY_OPTIONS.find(o => o.key === key)!
                return (
                  <div key={key} className="flex items-center gap-2 bg-primary-container rounded-md px-3 py-2">
                    <span className="text-[10px] font-mono text-on-primary-container/50 w-4 shrink-0">{idx + 1}</span>
                    <span className="text-sm font-medium text-on-primary-container flex-1">{opt.label}</span>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={() => moveGroupKey(idx, -1)} disabled={idx === 0}
                        className="flex items-center justify-center w-6 h-6 rounded text-on-primary-container/70 hover:text-on-primary-container disabled:opacity-20 transition-colors">
                        <ArrowUp />
                      </button>
                      <button onClick={() => moveGroupKey(idx, 1)} disabled={idx === groupByKeys.length - 1}
                        className="flex items-center justify-center w-6 h-6 rounded text-on-primary-container/70 hover:text-on-primary-container disabled:opacity-20 transition-colors">
                        <ArrowDown />
                      </button>
                      <button onClick={() => removeGroupKey(key)}
                        className="flex items-center justify-center w-6 h-6 rounded text-on-primary-container/70 hover:text-on-primary-container transition-colors text-base leading-none">
                        ×
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {available.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {available.map(opt => (
                <button key={opt.key} onClick={() => addGroupKey(opt.key)}
                  className="px-3 py-1.5 rounded-md text-sm font-medium bg-surface-high text-on-surface-variant hover:text-on-surface transition-colors">
                  + {opt.label}
                </button>
              ))}
            </div>
          )}
          {available.length === 0 && groupByKeys.length > 0 && (
            <p className="text-xs text-on-surface-variant font-mono text-right">כל השדות נבחרו</p>
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
                      {filterCount + groupByKeys.length}
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
                <div className="space-y-1.5">
                  {visibleItems.map((item, idx) =>
                    item.type === 'header' ? (
                      <button
                        key={`h-${item.path}`}
                        onClick={() => groupByKeys.length > 0 && toggleExpanded(item.path)}
                        className="w-full flex items-center gap-2 py-2 text-right"
                        style={{ paddingRight: item.depth * 12 }}
                      >
                        <span className="text-on-surface-variant"><ChevronIcon open={item.isExpanded ?? true} /></span>
                        <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider flex-1">
                          {item.title}
                        </span>
                        <span className="text-xs font-mono text-on-surface-variant">{item.count}</span>
                      </button>
                    ) : (
                      <EntryRow key={`${item.entry.soldier.id}-${item.entry.types.join(',')}-${idx}`} entry={item.entry} indent={item.depth} />
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
