import { useMemo, useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useDiaryData } from '@/features/diary/useDiaryData'
import { StatusBadge } from '@/components/StatusBadge'
import { FilterPane } from '@/components/FilterPane'
import { SaveViewDialog } from '@/components/SaveViewDialog'
import { useSavedViews } from '@/hooks/useSavedViews'
import { setActiveView } from '@/contexts/ActiveViewContext'
import { getStatus } from '@/domain/statuses'
import { useGroupBy, applyCollapse } from '@/features/filters/groupBy'
import { GroupBySection } from '@/features/filters/GroupBySection'
import {
  emptyFilterState, isFilterActive, activeFilterCount,
  buildFilterSections, applySoldierFilter,
  toggleMultiSelect, clearMultiKey, setTextFilter,
  type FilterState,
} from '@/features/filters'
import type { SoldierFields } from '@/domain/types'

// ── Group-by types ─────────────────────────────────────────────────────────

type GroupByKey = 'unit' | 'team' | 'role' | 'rank' | 'status'

const GROUP_BY_DEFAULTS: Array<{ key: GroupByKey; label: string }> = [
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
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [filterState, setFilterState] = useState<FilterState>(emptyFilterState())
  const [search, setSearch] = useState('')
  const { groupByKeys, setGroupByKeys, expanded, toggleExpanded, addGroupKey, removeGroupKey, moveGroupKey, reset: resetGroupBy } = useGroupBy<GroupByKey>()
  const viewBaseRef = useRef<FilterState | null>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const { saveView: persistView } = useSavedViews()

  // Apply pending filter + group-by when navigating from a saved view
  useEffect(() => {
    const state = location.state as { pendingFilter?: FilterState; pendingGroupBy?: string[]; viewName?: string } | null
    const pending = state?.pendingFilter
    if (!pending) return
    viewBaseRef.current = pending
    setFilterState(pending)
    setGroupByKeys((state?.pendingGroupBy ?? []) as GroupByKey[])
    setActiveView(state?.viewName ?? null)
    navigate(location.pathname, { replace: true, state: null })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  // Clear active view name when filter diverges from the saved base
  useEffect(() => {
    if (!viewBaseRef.current || filterState === viewBaseRef.current) return
    viewBaseRef.current = null
    setActiveView(null)
  }, [filterState])

  const colHeaders = data?.schema.soldierColHeaders
  const filterSections = useMemo(
    () => buildFilterSections(data?.soldiers ?? [], colHeaders),
    [data?.soldiers, colHeaders]
  )
  const groupByOptions = useMemo(
    () => GROUP_BY_DEFAULTS.map(o =>
      colHeaders?.get(o.key as never) ? { ...o, label: colHeaders.get(o.key as never)! } : o
    ),
    [colHeaders]
  )

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
    () => applyCollapse(flatItems, expanded),
    [flatItems, expanded]
  )

  const filterActive = isFilterActive(filterState)
  const filterCount  = activeFilterCount(filterState)

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
        onSaveRequest={() => setSaveDialogOpen(true)}
      >
        <GroupBySection
          options={groupByOptions}
          groupByKeys={groupByKeys}
          onAdd={addGroupKey}
          onRemove={removeGroupKey}
          onMove={moveGroupKey}
        />
      </FilterPane>

      <SaveViewDialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        onSave={async name => {
          await persistView({ name, view: '/soldiers', filterState, groupByKeys })
          viewBaseRef.current = filterState
          setActiveView(name)
        }}
      />

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
