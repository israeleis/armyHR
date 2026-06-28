import { useMemo, useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format, addDays, startOfToday, isToday } from 'date-fns'
import { he } from 'date-fns/locale'
import { PieChart, Pie, Cell } from 'recharts'
import { useDiaryData } from './useDiaryData'
import { StatusBadge } from '@/components/StatusBadge'
import { FilterPane } from '@/components/FilterPane'
import { useAuth } from '@/contexts/AuthContext'
import {
  emptyFilterState, isFilterActive, activeFilterCount,
  buildFilterSections, applySoldierFilter,
  toggleMultiSelect, clearMultiKey, setTextFilter,
  type FilterState,
} from '@/features/filters'
import { useGroupBy, applyCollapse } from '@/features/filters/groupBy'
import { GroupBySection } from '@/features/filters/GroupBySection'
import type { SoldierFields, StatusEntry } from '@/domain/types'

// ── Utilities ─────────────────────────────────────────────────────────────

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function FilterIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: active ? 'var(--color-primary)' : 'var(--color-on-surface-variant)' }}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}

// ── Group-by ───────────────────────────────────────────────────────────────

type GroupByKey = 'unit' | 'team' | 'rank' | 'status'

const GROUP_BY_OPTIONS: Array<{ key: GroupByKey; label: string }> = [
  { key: 'unit',   label: 'יחידה' },
  { key: 'team',   label: 'צוות' },
  { key: 'rank',   label: 'דרגה' },
  { key: 'status', label: 'סטטוס' },
]

// Status categories for the 'status' group-by key — aligned with SUMMARY_GROUPS below
const STATUS_LABEL_MAP: Array<{ label: string; codes: Set<string> }> = [
  { label: 'נוכח',          codes: new Set(['נ']) },
  { label: 'בדרכים',        codes: new Set(['י', 'ח', 'יח', 'חי', 'מ', 'פ', 'ל']) },
  { label: 'גימלים',         codes: new Set(['ג']) },
  { label: 'בבית בתשלום',   codes: new Set(['ת', 'ב']) },
  { label: 'משוחרר',         codes: new Set(['ש', 'ר', 'ד', 'ז', 'א']) },
]

export function getGroupLabel(soldier: SoldierFields, code: string, key: GroupByKey): string {
  switch (key) {
    case 'unit':   return soldier.unit  || 'ללא יחידה'
    case 'team':   return soldier.team  || 'ללא צוות'
    case 'rank':   return soldier.rank  || 'ללא דרגה'
    case 'status': {
      if (!code) return 'ללא סטטוס'
      for (const { label, codes } of STATUS_LABEL_MAP) {
        if (codes.has(code)) return label
      }
      return 'אחר'
    }
  }
}

// ── Flat-items builder ────────────────────────────────────────────────────
// applyCollapse requires ALL items to carry { type, depth, path? }.
// Both header and row types include depth for this reason.

type DiaryFlatItem =
  | { type: 'header'; label: string; depth: number; path: string; count: number; isExpanded?: boolean }
  | { type: 'row';    entry: StatusEntry; soldier: SoldierFields; depth: number }

function buildDiaryFlatItems(
  entries: StatusEntry[],
  soldierMap: Map<string, SoldierFields>,
  keys: GroupByKey[],
): DiaryFlatItem[] {
  function recurse(
    sub: StatusEntry[],
    remaining: GroupByKey[],
    depth: number,
    prefix: string,
  ): DiaryFlatItem[] {
    if (remaining.length === 0 || sub.length === 0) {
      return sub
        .map(entry => {
          const soldier = soldierMap.get(entry.soldierId)
          if (!soldier) return null
          return { type: 'row' as const, entry, soldier, depth }
        })
        .filter((x): x is Extract<DiaryFlatItem, { type: 'row' }> => x !== null)
        .sort((a, b) => a.soldier.name.localeCompare(b.soldier.name, 'he'))
    }

    const [key, ...rest] = remaining
    const groups = new Map<string, StatusEntry[]>()
    for (const entry of sub) {
      const soldier = soldierMap.get(entry.soldierId)
      if (!soldier) continue
      const label = getGroupLabel(soldier, entry.code, key)
      if (!groups.has(label)) groups.set(label, [])
      groups.get(label)!.push(entry)
    }

    const result: DiaryFlatItem[] = []
    for (const [label, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'he'))) {
      const path = prefix ? `${prefix}/${label}` : label
      result.push({ type: 'header', label, depth, path, count: group.length })
      result.push(...recurse(group, rest, depth + 1, path))
    }
    return result
  }

  return recurse(entries, keys, 0, '')
}

// ── Summary groups (for donut) ────────────────────────────────────────────

const SUMMARY_GROUPS = [
  { label: 'נוכח',     codes: ['נ'],                                    color: '#66ff33' },
  { label: 'בית',      codes: ['ב', 'חול'],                            color: '#f3cfc6' },
  { label: 'חולים',    codes: ['ג', 'ת'],                              color: '#f5cac3' },
  { label: 'בדרכים',  codes: ['י', 'ח', 'יח', 'חי', 'מ', 'פ', 'ל'], color: '#f4d35e' },
]

// ── DiaryScreen ───────────────────────────────────────────────────────────

export function DiaryScreen() {
  const { isSignedIn } = useAuth()
  const { data, isLoading, error } = useDiaryData()
  const navigate = useNavigate()
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterState, setFilterState] = useState<FilterState>(emptyFilterState())
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)
  const carouselRef = useRef<HTMLDivElement>(null)
  const today = startOfToday()

  const {
    groupByKeys, expanded, toggleExpanded,
    addGroupKey, removeGroupKey, moveGroupKey, reset: resetGroupBy,
  } = useGroupBy<GroupByKey>()

  const dates = useMemo(() => {
    if (data && data.schema.dateColIndices.size > 0) {
      return Array.from(data.schema.dateColIndices.values())
        .sort((a, b) => a.getTime() - b.getTime())
    }
    return Array.from({ length: 14 }, (_, i) => addDays(today, i - 3))
  }, [data, today])

  const activeDate = useMemo(() => {
    if (selectedDateKey) {
      const found = dates.find(d => toDateKey(d) === selectedDateKey)
      if (found) return found
    }
    return dates.find(d => isToday(d)) ?? dates[dates.length - 1] ?? today
  }, [selectedDateKey, dates, today])

  const activeDateKey = toDateKey(activeDate)

  const filterSections = useMemo(() => buildFilterSections(data?.soldiers ?? []), [data?.soldiers])

  const filteredSoldiers = useMemo(() => {
    if (!data) return []
    return applySoldierFilter(data.soldiers, filterState)
  }, [data, filterState])

  const filteredIds = useMemo(() => new Set(filteredSoldiers.map(s => s.id)), [filteredSoldiers])

  const soldierMap = useMemo(
    () => new Map(data?.soldiers.map(s => [s.id, s]) ?? []),
    [data?.soldiers],
  )

  const activeDateStatuses = useMemo(() => {
    if (!data) return []
    return data.statuses.filter(e => e.dateKey === activeDateKey && filteredIds.has(e.soldierId))
  }, [data, activeDateKey, filteredIds])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const entry of activeDateStatuses) {
      if (entry.code) counts[entry.code] = (counts[entry.code] ?? 0) + 1
    }
    return counts
  }, [activeDateStatuses])

  const summaryGroups = useMemo(() =>
    SUMMARY_GROUPS.map(g => ({
      ...g,
      count: g.codes.reduce((sum, code) => sum + (statusCounts[code] ?? 0), 0),
    })),
    [statusCounts],
  )

  const totalCount = summaryGroups.reduce((s, g) => s + g.count, 0)
  const donutData  = summaryGroups.filter(g => g.count > 0)

  // Flat items for group-by mode
  const diaryFlatItems = useMemo(
    () => groupByKeys.length > 0 ? buildDiaryFlatItems(activeDateStatuses, soldierMap, groupByKeys) : [],
    [activeDateStatuses, soldierMap, groupByKeys],
  )

  // Apply collapse (removes rows whose parent header is collapsed)
  const visibleItems = useMemo(
    () => applyCollapse(diaryFlatItems, expanded),
    [diaryFlatItems, expanded],
  )

  // Flat preview (no group-by)
  const previewSoldiers = useMemo(
    () => activeDateStatuses.filter(e => e.code).slice(0, 6),
    [activeDateStatuses],
  )

  // Scroll carousel to active date
  useEffect(() => {
    if (!carouselRef.current) return
    const idx = dates.findIndex(d => toDateKey(d) === activeDateKey)
    if (idx < 0) return
    const el = carouselRef.current.children[idx] as HTMLElement | undefined
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [activeDateKey, dates])

  const filterActive = isFilterActive(filterState)
  const filterCount  = activeFilterCount(filterState)
  const hasGroupBy   = groupByKeys.length > 0

  if (!isSignedIn) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
        <p className="text-on-surface-variant text-sm">נדרשת כניסה</p>
        <Link to="/signin" className="text-primary font-bold underline">כניסה</Link>
      </div>
    )
  }

  return (
    <>
      <FilterPane
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        sections={filterSections}
        multiSelect={filterState.multiSelect}
        text={filterState.text}
        onMultiToggle={(key, val) => setFilterState(s => toggleMultiSelect(s, key, val))}
        onMultiClear={key => setFilterState(s => clearMultiKey(s, key))}
        onTextChange={(key, val) => setFilterState(s => setTextFilter(s, key, val))}
        onClearAll={() => { setFilterState(emptyFilterState()); resetGroupBy() }}
      >
        <GroupBySection
          options={GROUP_BY_OPTIONS}
          groupByKeys={groupByKeys}
          onAdd={addGroupKey}
          onRemove={removeGroupKey}
          onMove={moveGroupKey}
        />
      </FilterPane>

      <div dir="rtl" className="flex flex-col flex-1 overflow-hidden bg-background">

        {/* Toolbar */}
        <div className="px-4 py-3 flex items-center justify-end">
          <button
            onClick={() => setFilterOpen(true)}
            className="relative flex items-center justify-center w-[44px] h-[44px] rounded-md hover:bg-surface-high transition-colors"
            aria-label="פתח סינון"
          >
            <FilterIcon active={filterActive || hasGroupBy} />
            {(filterActive || hasGroupBy) && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-primary text-on-primary text-[9px] font-bold flex items-center justify-center px-0.5">
                {filterCount + groupByKeys.length}
              </span>
            )}
          </button>
        </div>

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

        {data && (
          <div className="flex-1 overflow-y-auto">

            {/* ─── Date carousel ─── */}
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">ציר זמן תאריכים</span>
                <span className="text-xs font-mono text-on-surface-variant">
                  {format(activeDate, 'yyyy', { locale: he })}
                </span>
              </div>
              <div
                ref={carouselRef}
                className="flex gap-2 overflow-x-auto no-scrollbar pb-1"
                style={{ direction: 'rtl' }}
              >
                {dates.map(date => {
                  const dk = toDateKey(date)
                  const active = dk === activeDateKey
                  const today_ = isToday(date)
                  return (
                    <button
                      key={dk}
                      onClick={() => setSelectedDateKey(dk)}
                      className={`shrink-0 flex flex-col items-center justify-center rounded-md transition-all
                        ${active
                          ? 'w-[80px] h-[80px] bg-primary-container border border-primary/60'
                          : today_
                            ? 'w-[60px] h-[68px] bg-surface-high border border-primary/40'
                            : 'w-[60px] h-[68px] bg-surface-high border border-transparent'}`}
                    >
                      <span className={`text-[10px] font-mono uppercase mb-0.5 ${active ? 'text-on-primary-container' : 'text-on-surface-variant'}`}>
                        {format(date, 'EEE', { locale: he })}
                      </span>
                      <span className={`font-bold leading-none ${active ? 'text-xl text-on-primary-container' : 'text-sm text-on-surface'}`}>
                        {format(date, 'd.MM')}
                      </span>
                      {today_ && (
                        <span className={`text-[8px] font-bold mt-0.5 ${active ? 'text-on-primary-container' : 'text-primary'}`}>
                          היום
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ─── Daily summary card ─── */}
            <div className="mx-4 mb-4 bg-surface-container border border-outline-variant rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant">
                <span className="text-xs font-mono text-on-surface-variant">
                  {format(activeDate, 'd.MM', { locale: he })}
                </span>
                <span className="text-sm font-bold text-on-surface">סיכום יומי</span>
              </div>

              {totalCount > 0 ? (
                <div className="p-4">
                  <div className="flex flex-row items-center gap-4">
                    <div className="relative shrink-0 w-[110px] h-[110px]">
                      <PieChart width={110} height={110}>
                        <Pie
                          data={donutData}
                          cx={50} cy={50}
                          innerRadius={32} outerRadius={50}
                          dataKey="count"
                          strokeWidth={1} stroke="#131313"
                          startAngle={90} endAngle={-270}
                        >
                          {donutData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                      </PieChart>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-lg font-bold text-on-surface leading-none">{totalCount}</span>
                        <span className="text-[9px] text-on-surface-variant font-mono">כוח</span>
                      </div>
                    </div>
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      {summaryGroups.map(g => (
                        <div key={g.label} className="bg-surface-high rounded-md px-3 py-2 text-right">
                          <div className="text-2xl font-bold leading-none mb-0.5"
                            style={{ color: g.count > 0 ? g.color : '#47483c' }}>
                            {g.count}
                          </div>
                          <div className="text-[10px] font-mono text-on-surface-variant">{g.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/diary/${activeDateKey}`)}
                    className="mt-3 w-full text-center text-xs font-bold text-primary py-2 border border-outline-variant rounded-md hover:bg-surface-high transition-colors"
                  >
                    פירוט מלא ←
                  </button>
                </div>
              ) : (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-on-surface-variant">אין נתונים לתאריך זה</p>
                  <button onClick={() => navigate(`/diary/${activeDateKey}`)} className="mt-2 text-xs text-primary underline">
                    פתח פירוט
                  </button>
                </div>
              )}
            </div>

            {/* ─── Personnel section ─── */}
            {hasGroupBy ? (
              /* Group-by mode: full flat list with collapsible headers as siblings */
              visibleItems.length > 0 && (
                <div className="mx-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-on-surface-variant">{activeDateStatuses.length} חיילים</span>
                    <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">מצב כוח אדם</span>
                  </div>
                  <div className="space-y-1">
                    {visibleItems.map((item, idx) => {
                      if (item.type === 'header') {
                        return (
                          <button
                            key={item.path}
                            onClick={() => toggleExpanded(item.path)}
                            className="w-full flex items-center justify-between px-3 py-2 bg-surface-container border border-outline-variant rounded-lg hover:bg-surface-high transition-colors"
                            style={{ marginRight: `${item.depth * 16}px` }}
                          >
                            <span className={`text-on-surface-variant text-lg transition-transform ${item.isExpanded ? 'rotate-90' : ''}`}>›</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-on-surface">{item.label}</span>
                              <span className="text-xs font-mono bg-primary-container text-on-primary-container rounded-full px-2 py-0.5">{item.count}</span>
                            </div>
                          </button>
                        )
                      }
                      const { soldier, entry } = item
                      const initials = soldier.name.trim().split(' ').map(w => w[0]).join('').slice(0, 2)
                      return (
                        <button
                          key={`${entry.soldierId}-${idx}`}
                          onClick={() => navigate(`/soldier/${encodeURIComponent(soldier.id)}`)}
                          className="w-full flex flex-row-reverse items-center gap-3 bg-surface-high border border-outline-variant rounded-md px-3 py-2.5 hover:bg-surface-bright transition-colors"
                          style={{ marginRight: `${item.depth * 16}px` }}
                        >
                          <div className="shrink-0 w-9 h-9 rounded-full bg-primary-container flex items-center justify-center text-xs font-bold text-on-primary-container">
                            {initials}
                          </div>
                          <div className="flex-1 text-right min-w-0">
                            <div className="text-sm font-bold text-on-surface truncate">{soldier.name}</div>
                            {(soldier.rank || soldier.unit) && (
                              <div className="text-[10px] font-mono text-on-surface-variant">
                                {[soldier.rank, soldier.unit].filter(Boolean).join(' · ')}
                              </div>
                            )}
                          </div>
                          <StatusBadge code={entry.code} size="sm" />
                          <span className="text-outline text-sm">›</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            ) : (
              /* Flat preview mode: up to 6 soldiers */
              previewSoldiers.length > 0 && (
                <div className="mx-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-primary font-bold">
                      {activeDateStatuses.filter(e => e.code).length > 6 && (
                        <button onClick={() => navigate(`/diary/${activeDateKey}`)}>
                          הכל ({activeDateStatuses.filter(e => e.code).length}) ←
                        </button>
                      )}
                    </span>
                    <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">מצב כוח אדם</span>
                  </div>
                  <div className="space-y-1">
                    {previewSoldiers.map(entry => {
                      const soldier = data.soldiers.find(s => s.id === entry.soldierId)
                      if (!soldier) return null
                      const initials = soldier.name.trim().split(' ').map(w => w[0]).join('').slice(0, 2)
                      return (
                        <button
                          key={entry.soldierId}
                          onClick={() => navigate(`/soldier/${encodeURIComponent(soldier.id)}`)}
                          className="w-full flex flex-row-reverse items-center gap-3 bg-surface-high border border-outline-variant rounded-md px-3 py-2.5 hover:bg-surface-bright transition-colors"
                        >
                          <div className="shrink-0 w-9 h-9 rounded-full bg-primary-container flex items-center justify-center text-xs font-bold text-on-primary-container">
                            {initials}
                          </div>
                          <div className="flex-1 text-right min-w-0">
                            <div className="text-sm font-bold text-on-surface truncate">{soldier.name}</div>
                            {(soldier.rank || soldier.unit) && (
                              <div className="text-[10px] font-mono text-on-surface-variant">
                                {[soldier.rank, soldier.unit].filter(Boolean).join(' · ')}
                              </div>
                            )}
                          </div>
                          <StatusBadge code={entry.code} size="sm" />
                          <span className="text-outline text-sm">›</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            )}

            {/* ─── Recent changes placeholder ─── */}
            <div className="mx-4 mb-4 p-4 bg-surface-high rounded-md border border-outline-variant text-right">
              <h2 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">שינויים אחרונים</h2>
              <p className="text-xs text-outline font-mono">אין שינויים אחרונים</p>
            </div>

          </div>
        )}

        {/* FAB */}
        <button
          onClick={() => navigate(`/diary/${activeDateKey}`)}
          className="fixed bottom-4 left-4 w-14 h-14 rounded-full bg-primary-container text-on-primary-container text-2xl font-bold shadow-lg flex items-center justify-center z-20 hover:opacity-90 transition-opacity"
          aria-label="פתח יומן"
        >
          +
        </button>
      </div>
    </>
  )
}
