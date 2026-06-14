import { useMemo, useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDiaryData } from '@/features/diary/useDiaryData'
import { StatusBadge } from '@/components/StatusBadge'
import { FilterPane, CollapsibleSection } from '@/components/FilterPane'
import { getStatus } from '@/domain/statuses'
import {
  emptyFilterState, isFilterActive, activeFilterCount,
  buildFilterSections, applySoldierFilter,
  toggleMultiSelect, clearMultiKey, setTextFilter,
  type FilterState,
} from '@/features/filters'
import type { SoldierFields } from '@/domain/types'

// ── Group-by types ─────────────────────────────────────────────────────────

type GroupByKey = 'unit' | 'team' | 'role' | 'rank' | 'status'

const GROUP_BY_OPTIONS: Array<{ key: GroupByKey; label: string }> = [
  { key: 'unit',   label: 'יחידה'  },
  { key: 'team',   label: 'כיתה'   },
  { key: 'role',   label: 'תפקיד'  },
  { key: 'rank',   label: 'דרגה'   },
  { key: 'status', label: 'סטטוס'  },
]

function getGroupValue(s: SoldierFields, key: GroupByKey, latestStatus: Map<string, string>): string {
  switch (key) {
    case 'unit':   return s.unit   || 'ללא יחידה'
    case 'team':   return s.team   || 'ללא כיתה'
    case 'role':   return s.role   || 'ללא תפקיד'
    case 'rank':   return s.rank   || 'ללא דרגה'
    case 'status': {
      const code = latestStatus.get(s.id)
      return code ? (getStatus(code)?.name ?? code) : 'ללא סטטוס'
    }
  }
}

// ── Flat list types ────────────────────────────────────────────────────────

type FlatHeader  = { type: 'header';  title: string; depth: number; count: number; path: string }
type FlatSoldier = { type: 'soldier'; soldier: SoldierFields; code?: string; depth: number }
type FlatItem = FlatHeader | FlatSoldier

function buildFlatItems(
  soldiers: SoldierFields[],
  keys: GroupByKey[],
  latestStatus: Map<string, string>,
  depth = 0,
  parentPath = '',
): FlatItem[] {
  if (keys.length === 0) {
    return soldiers.map(s => ({ type: 'soldier', soldier: s, code: latestStatus.get(s.id), depth }))
  }
  const [key, ...rest] = keys
  const map = new Map<string, SoldierFields[]>()
  for (const s of soldiers) {
    const val = getGroupValue(s, key, latestStatus)
    if (!map.has(val)) map.set(val, [])
    map.get(val)!.push(s)
  }
  const result: FlatItem[] = []
  for (const [title, group] of [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'he'))) {
    const path = parentPath ? `${parentPath}||${title}` : title
    result.push({ type: 'header', title, depth, count: group.length, path })
    result.push(...buildFlatItems(group, rest, latestStatus, depth + 1, path))
  }
  return result
}

// Filters flatItems to only visible items given the expanded set.
// A header at depth D is visible if no ancestor header is collapsed.
// Items following a collapsed header at depth D are skipped until a header at depth ≤ D appears.
function applyCollapse(
  flatItems: FlatItem[],
  expanded: Set<string>,
): Array<FlatItem & { isExpanded?: boolean }> {
  const result: Array<FlatItem & { isExpanded?: boolean }> = []
  let collapsedDepth: number | null = null

  for (const item of flatItems) {
    if (collapsedDepth !== null) {
      if (item.type === 'header' && item.depth <= collapsedDepth) {
        collapsedDepth = null  // sibling or ancestor — stop skipping
      } else {
        continue  // skip children of collapsed header
      }
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
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: active ? 'var(--color-primary)' : 'var(--color-on-surface-variant)' }}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
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

// ── Soldier row ────────────────────────────────────────────────────────────

function SoldierRow({ soldier, code, indent }: { soldier: SoldierFields; code?: string; indent: number }) {
  const navigate = useNavigate()
  const initials = soldier.name.trim().split(' ').map(w => w[0]).join('').slice(0, 2)
  return (
    <button
      onClick={() => navigate(`/soldier/${encodeURIComponent(soldier.id)}`)}
      className="w-full flex items-center gap-3 bg-surface-high border border-outline-variant rounded-lg px-3 py-2.5 hover:bg-surface-bright transition-colors text-right"
      style={{ marginRight: indent * 12 }}
    >
      <div className="shrink-0 w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-sm font-bold text-on-primary-container">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-on-surface truncate">{soldier.name}</div>
        <div className="text-[11px] font-mono text-on-surface-variant truncate">
          {[soldier.rank, soldier.unit, soldier.team, soldier.role].filter(Boolean).join(' · ')}
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {code && <StatusBadge code={code} size="sm" />}
        <span className="text-outline text-sm">›</span>
      </div>
    </button>
  )
}

// ── SoldiersScreen ─────────────────────────────────────────────────────────

export function SoldiersScreen() {
  const { data, isLoading } = useDiaryData()
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterState, setFilterState] = useState<FilterState>(emptyFilterState())
  const [search, setSearch] = useState('')
  const [groupByKeys, setGroupByKeys] = useState<GroupByKey[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Reset collapsed state whenever the grouping changes
  useEffect(() => { setExpanded(new Set()) }, [groupByKeys])

  const toggleExpanded = useCallback((path: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
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

  const filterSections = useMemo(() => buildFilterSections(data?.soldiers ?? []), [data?.soldiers])

  const latestStatus = useMemo(() => {
    if (!data) return new Map<string, string>()
    const map = new Map<string, string>()
    const sorted = [...data.statuses].sort((a, b) => b.date.getTime() - a.date.getTime())
    for (const e of sorted) {
      if (!map.has(e.soldierId) && e.code) map.set(e.soldierId, e.code)
    }
    return map
  }, [data])

  const filtered = useMemo(() => {
    if (!data) return []
    let list = applySoldierFilter(data.soldiers, filterState)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.rank?.toLowerCase().includes(q) ||
        s.unit?.toLowerCase().includes(q) ||
        s.role?.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
      )
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, 'he'))
  }, [data, filterState, search])

  const flatItems = useMemo(
    () => buildFlatItems(filtered, groupByKeys, latestStatus),
    [filtered, groupByKeys, latestStatus]
  )

  const visibleItems = useMemo(
    () => groupByKeys.length > 0 ? applyCollapse(flatItems, expanded) : flatItems,
    [flatItems, expanded, groupByKeys.length]
  )

  const filterActive = isFilterActive(filterState)
  const filterCount  = activeFilterCount(filterState)
  const available    = GROUP_BY_OPTIONS.filter(o => !groupByKeys.includes(o.key))

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

      <div dir="rtl" className="flex flex-col flex-1 overflow-hidden">

        <div className="px-4 pt-3 pb-2 flex items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם, דרגה, תפקיד..."
            className="flex-1 bg-surface-high border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/50 font-mono"
            style={{ minHeight: 0 }}
          />
          <button
            onClick={() => setFilterOpen(true)}
            className="relative flex items-center justify-center w-[44px] h-[44px] rounded-md hover:bg-surface-high transition-colors shrink-0"
            aria-label="פתח סינון"
          >
            <FilterIcon active={filterActive || groupByKeys.length > 0} />
            {(filterActive || groupByKeys.length > 0) && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-primary text-on-primary text-[9px] font-bold flex items-center justify-center px-0.5">
                {filterCount + groupByKeys.length}
              </span>
            )}
          </button>
        </div>

        {isLoading && (
          <div className="flex-1 flex items-center justify-center text-on-surface-variant font-mono text-sm">טוען...</div>
        )}

        {data && (
          <div className="px-4 pb-1">
            <span className="text-[11px] font-mono text-on-surface-variant">{filtered.length} חיילים</span>
          </div>
        )}

        {data && (
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1.5">
            {filtered.length === 0 && (
              <p className="text-sm text-on-surface-variant text-center py-10 font-mono">לא נמצאו חיילים</p>
            )}
            {visibleItems.map((item, idx) =>
              item.type === 'header' ? (
                <button
                  key={`h-${item.path}`}
                  onClick={() => toggleExpanded(item.path)}
                  className="w-full flex items-center gap-2 py-2 text-right"
                  style={{ paddingRight: item.depth * 12 }}
                >
                  <span className="text-on-surface-variant">
                    <ChevronIcon open={!!(item as any).isExpanded} />
                  </span>
                  <span className="text-[11px] font-mono font-bold text-primary uppercase tracking-wider">
                    {item.title}
                  </span>
                  <span className="text-[10px] font-mono text-on-surface-variant">({item.count})</span>
                </button>
              ) : (
                <SoldierRow key={`${item.soldier.id}-${idx}`} soldier={item.soldier} code={item.code} indent={item.depth} />
              )
            )}
          </div>
        )}
      </div>
    </>
  )
}
