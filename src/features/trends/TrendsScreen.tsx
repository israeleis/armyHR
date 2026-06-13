import { useMemo, useRef, useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useDiaryData } from '@/features/diary/useDiaryData'
import { FilterPane } from '@/components/FilterPane'
import { SaveViewDialog } from '@/components/SaveViewDialog'
import { isInArmy, isPaid, getStatus } from '@/domain/statuses'
import {
  emptyFilterState, isFilterActive, activeFilterCount,
  buildFilterSections, applySoldierFilter,
  toggleMultiSelect, clearMultiKey, setTextFilter,
  decodeFilterState,
  type FilterState,
} from '@/features/filters'
import { useSavedViews } from '@/hooks/useSavedViews'

const TIME_TABS = ['שבועי', 'חודשי', 'כל הזמן'] as const
type TimeTab = typeof TIME_TABS[number]

const PERIOD_DAYS: Record<TimeTab, number | null> = {
  'שבועי': 7,
  'חודשי': 30,
  'כל הזמן': null,
}

const STATUS_COLORS: Record<string, string> = {
  'נ': '#c3cc8c',
}
const FALLBACK_COLORS = ['#f4d35e', '#f5cac3', '#88c0d0', '#a3be8c', '#ebcb8b', '#b48ead']

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Filter icon ────────────────────────────────────────────────────────────

function FilterIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: active ? 'var(--color-primary)' : 'var(--color-on-surface-variant)' }}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}

// ── Period tab selector ────────────────────────────────────────────────────

function PeriodTabs({ value, onChange }: { value: TimeTab; onChange: (t: TimeTab) => void }) {
  const n = TIME_TABS.length
  const activeIdx = TIME_TABS.indexOf(value)
  const pillLeftPct = ((n - 1 - activeIdx) / (n - 1)) * (100 - 100 / n)

  return (
    <div className="relative flex bg-surface-high rounded-lg p-1" dir="rtl">
      <div
        className="absolute inset-y-1 rounded-md bg-primary-container pointer-events-none"
        style={{
          width: `calc(${100 / n}% - 8px)`,
          left: `calc(${pillLeftPct}% + 4px)`,
          transition: 'left 150ms ease',
        }}
      />
      {TIME_TABS.map(tab => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`relative flex-1 text-sm py-2.5 text-center font-bold z-10 select-none transition-colors duration-150 ${
            tab === value ? 'text-on-primary-container' : 'text-on-surface-variant'
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}

// ── Draggable time range slider (two handles) ─────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000

function TimeRangeSlider({
  minMs, maxMs, startMs, endMs, onStartChange, onEndChange,
}: {
  minMs: number; maxMs: number
  startMs: number; endMs: number
  onStartChange: (ms: number) => void
  onEndChange: (ms: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    mode: 'start' | 'end' | 'pan'
    originX: number
    originStartMs: number
    originEndMs: number
  } | null>(null)

  const totalMs = maxMs - minMs
  if (totalMs <= 0) return null

  const startPct = ((startMs - minMs) / totalMs) * 100
  const endPct   = ((endMs   - minMs) / totalMs) * 100
  const days = Math.max(1, Math.round((endMs - startMs) / DAY_MS))

  function msPerPx() {
    return trackRef.current ? totalMs / trackRef.current.getBoundingClientRect().width : 0
  }

  function onDown(mode: 'start' | 'end' | 'pan') {
    return (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
      drag.current = { mode, originX: e.clientX, originStartMs: startMs, originEndMs: endMs }
    }
  }

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const delta = (e.clientX - drag.current.originX) * msPerPx()
    const { mode, originStartMs, originEndMs } = drag.current
    const spanMs = originEndMs - originStartMs

    if (mode === 'start') {
      onStartChange(Math.max(minMs, Math.min(originEndMs - DAY_MS, originStartMs + delta)))
    } else if (mode === 'end') {
      onEndChange(Math.min(maxMs, Math.max(originStartMs + DAY_MS, originEndMs + delta)))
    } else {
      // pan: move both handles, preserve span
      const newStart = Math.max(minMs, Math.min(maxMs - spanMs, originStartMs + delta))
      onStartChange(newStart)
      onEndChange(newStart + spanMs)
    }
  }

  function onUp() { drag.current = null }

  return (
    <div className="px-1 py-1" dir="ltr">
      <div
        ref={trackRef}
        className="relative h-8 flex items-center select-none"
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        {/* Track */}
        <div className="absolute inset-x-0 h-1.5 bg-surface-container rounded-full" />

        {/* Selection fill — dragging pans the window */}
        <div
          className="absolute h-6 rounded-full bg-primary/20 cursor-grab active:cursor-grabbing touch-none"
          style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
          onPointerDown={onDown('pan')}
        />

        {/* Start handle */}
        <div
          className="absolute w-5 h-5 rounded-full bg-primary border-2 border-surface-high shadow-md cursor-grab active:cursor-grabbing touch-none z-10"
          style={{ left: `calc(${startPct}% - 10px)` }}
          onPointerDown={onDown('start')}
        />

        {/* End handle */}
        <div
          className="absolute w-5 h-5 rounded-full bg-primary border-2 border-surface-high shadow-md cursor-grab active:cursor-grabbing touch-none z-10"
          style={{ left: `calc(${endPct}% - 10px)` }}
          onPointerDown={onDown('end')}
        />
      </div>

      {/* Labels */}
      <div className="flex justify-between text-[10px] font-mono text-on-surface-variant -mt-0.5">
        <span>{format(new Date(minMs), 'dd/MM/yy')}</span>
        <span className="text-primary font-bold">
          {format(new Date(startMs), 'dd/MM')} – {format(new Date(endMs), 'dd/MM')} · {days}י
        </span>
        <span>{format(new Date(maxMs), 'dd/MM/yy')}</span>
      </div>
    </div>
  )
}

// ── TrendsScreen ───────────────────────────────────────────────────────────

export function TrendsScreen() {
  const { data, isLoading } = useDiaryData()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<TimeTab>('שבועי')
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterState, setFilterState] = useState<FilterState>(emptyFilterState())
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const { saveView: persistView } = useSavedViews()
  const [windowStartMs, setWindowStartMs] = useState<number | null>(null)
  const [windowEndMs, setWindowEndMs] = useState<number | null>(null)

  const filterSections = useMemo(() => buildFilterSections(data?.soldiers ?? []), [data?.soldiers])

  // IDs of soldiers that pass the current filter
  const filteredSoldierIds = useMemo(() => {
    if (!data) return new Set<string>()
    return new Set(applySoldierFilter(data.soldiers, filterState).map(s => s.id))
  }, [data, filterState])

  // Data date range
  const { minMs, maxMs } = useMemo(() => {
    if (!data || data.statuses.length === 0) return { minMs: 0, maxMs: 0 }
    const keys = [...new Set(data.statuses.map(e => e.dateKey))].sort()
    return {
      minMs: parseISO(keys[0]).getTime(),
      maxMs: parseISO(keys[keys.length - 1]).getTime(),
    }
  }, [data])

  // Reset window to tab defaults when tab changes (read current data range via ref)
  const dateRangeRef = useRef({ minMs: 0, maxMs: 0 })
  dateRangeRef.current = { minMs, maxMs }

  useEffect(() => {
    const { minMs, maxMs } = dateRangeRef.current
    const days = PERIOD_DAYS[activeTab]
    setWindowEndMs(maxMs || null)
    setWindowStartMs(days !== null && maxMs ? Math.max(minMs, maxMs - days * DAY_MS) : null)
  }, [activeTab])

  // Apply pending filter from sidebar navigation or shared URL (mount only)
  useEffect(() => {
    const pending = (location.state as { pendingFilter?: FilterState } | null)?.pendingFilter
    if (pending) { setFilterState(pending); return }
    const encoded = searchParams.get('filter')
    if (encoded) {
      const decoded = decodeFilterState(encoded)
      if (decoded) setFilterState(decoded)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Derive effective window (null → data extremes)
  const effectiveEndMs   = windowEndMs   ?? maxMs
  const effectiveStartMs = windowStartMs ?? (
    PERIOD_DAYS[activeTab] !== null
      ? Math.max(minMs, maxMs - (PERIOD_DAYS[activeTab]! * DAY_MS))
      : minMs
  )

  // Filtered statuses (by time window + soldier filter)
  const filteredStatuses = useMemo(() => {
    if (!data) return []
    const startKey = effectiveStartMs ? toDateKey(new Date(effectiveStartMs)) : null
    const endKey   = effectiveEndMs   ? toDateKey(new Date(effectiveEndMs))   : null
    const hasFilter = isFilterActive(filterState)

    return data.statuses.filter(e => {
      if (!e.dateKey) return false
      if (startKey && e.dateKey < startKey) return false
      if (endKey   && e.dateKey > endKey)   return false
      if (hasFilter && !filteredSoldierIds.has(e.soldierId)) return false
      return true
    })
  }, [data, effectiveStartMs, effectiveEndMs, filteredSoldierIds, filterState])

  // Line chart data — 4 status categories over time
  const lineChartData = useMemo(() => {
    type Row = { date: Date; בסיס: number; 'בבית בתשלום': number; משוחרר: number; גימלים: number; _total: number }
    const byDate = new Map<string, Row>()
    for (const entry of filteredStatuses) {
      if (!byDate.has(entry.dateKey)) {
        byDate.set(entry.dateKey, { date: entry.date, בסיס: 0, 'בבית בתשלום': 0, משוחרר: 0, גימלים: 0, _total: 0 })
      }
      const row = byDate.get(entry.dateKey)!
      row._total++
      const code = entry.code
      if (code === 'ג') {
        row.גימלים++
      } else if (isInArmy(code)) {
        row.בסיס++
      } else if (isPaid(code)) {
        row['בבית בתשלום']++
      } else {
        row.משוחרר++
      }
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, row]) => ({ ...row, label: format(row.date, 'dd/MM') }))
  }, [filteredStatuses])

  // Bar chart data — % in-army per unit
  const unitBarData = useMemo(() => {
    if (!data) return []
    const soldierUnitMap = new Map(data.soldiers.map(s => [s.id, s.unit ?? '']))
    const byUnit = new Map<string, { total: number; inArmy: number }>()
    for (const entry of filteredStatuses) {
      const unit = soldierUnitMap.get(entry.soldierId) ?? ''
      if (!unit) continue
      if (!byUnit.has(unit)) byUnit.set(unit, { total: 0, inArmy: 0 })
      const row = byUnit.get(unit)!
      row.total += 1
      if (isInArmy(entry.code)) row.inArmy += 1
    }
    return [...byUnit.entries()]
      .map(([unit, { total, inArmy }]) => ({
        unit,
        pct: total > 0 ? Math.round((inArmy / total) * 100) : 0,
        present: inArmy,
        total,
      }))
      .sort((a, b) => b.pct - a.pct)
  }, [filteredStatuses, data])

  // Pie chart data — status code breakdown
  const pieData = useMemo(() => {
    const byCode = new Map<string, number>()
    for (const entry of filteredStatuses) {
      byCode.set(entry.code, (byCode.get(entry.code) ?? 0) + 1)
    }
    return [...byCode.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
  }, [filteredStatuses])

  const totalStatuses = pieData.reduce((s, d) => s + d.count, 0)

  const { inArmyAvg, totalAvg } = useMemo(() => {
    if (lineChartData.length === 0) return { inArmyAvg: 0, totalAvg: 0 }
    const n = lineChartData.length
    return {
      inArmyAvg: Math.round(lineChartData.reduce((s, d) => s + d.בסיס + d.גימלים, 0) / n),
      totalAvg:  Math.round(lineChartData.reduce((s, d) => s + d._total, 0) / n),
    }
  }, [lineChartData])

  const availabilityPct = totalAvg > 0 ? Math.round((inArmyAvg / totalAvg) * 100) : 0

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
        onClearAll={() => setFilterState(emptyFilterState())}
        onSaveRequest={() => setSaveDialogOpen(true)}
      />
      <SaveViewDialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        onSave={async (name) => { await persistView({ name, view: '/trends', filterState }) }}
      />

      <div className="flex flex-col flex-1 overflow-hidden" dir="rtl">
        {/* Toolbar: period tabs + filter button */}
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="flex-1">
            <PeriodTabs value={activeTab} onChange={setActiveTab} />
          </div>
          <button
            onClick={() => setFilterOpen(true)}
            className="relative flex items-center justify-center w-[44px] h-[44px] rounded-md hover:bg-surface-high transition-colors"
            aria-label="פתח סינון"
          >
            <FilterIcon active={filterActive} />
            {filterActive && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-primary text-on-primary text-[9px] font-bold flex items-center justify-center px-0.5">
                {filterCount}
              </span>
            )}
          </button>
        </div>

        {isLoading && (
          <div className="flex-1 flex items-center justify-center text-on-surface-variant font-mono text-sm">
            טוען...
          </div>
        )}

        {data && (
          <div className="flex-1 overflow-y-auto px-4 pb-6 flex flex-col gap-6">
            {lineChartData.length === 0 ? (
              <div className="text-center text-on-surface-variant text-sm py-12">
                אין נתונים ל{activeTab}
              </div>
            ) : (
              <>
                {/* KPI summary row */}
                <div className="flex gap-3">
                  <div className="bg-primary-container rounded-lg p-4 flex-1 text-center">
                    <div className="text-4xl font-bold text-on-primary-container">{inArmyAvg}</div>
                    <div className="text-xs font-mono text-on-primary-container/70 mt-1">ממוצע בסיס</div>
                  </div>
                  <div className="bg-surface-container border border-outline-variant rounded-lg p-4 flex-1 text-center">
                    <div className="text-4xl font-bold text-primary">{availabilityPct}%</div>
                    <div className="text-xs font-mono text-on-surface-variant mt-1">זמינות</div>
                  </div>
                </div>

                {/* Time range slider */}
                {minMs > 0 && (
                  <div className="bg-surface-high rounded-lg px-4 pt-3 pb-2 border border-outline-variant">
                    <div className="text-xs font-mono font-bold text-primary mb-2">טווח זמן</div>
                    <TimeRangeSlider
                      minMs={minMs}
                      maxMs={maxMs}
                      startMs={effectiveStartMs}
                      endMs={effectiveEndMs}
                      onStartChange={ms => setWindowStartMs(ms)}
                      onEndChange={ms => setWindowEndMs(ms)}
                    />
                  </div>
                )}

                {/* Line chart — trend over time */}
                <div className="bg-surface-high rounded-lg p-4 border border-outline-variant">
                  <div className="text-xs font-mono font-bold text-primary mb-3">מגמה לאורך זמן</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={lineChartData} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}>
                      <CartesianGrid stroke="#47483c" strokeDasharray="4 4" />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: '#c8c7b8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                        axisLine={{ stroke: '#47483c' }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: '#c8c7b8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#201f1f',
                          border: '1px solid #47483c',
                          borderRadius: 4,
                          fontFamily: 'Public Sans',
                          direction: 'rtl',
                        }}
                        labelStyle={{ color: '#e5e2e1', fontWeight: 700 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'Public Sans', color: '#c8c7b8', paddingTop: 8 }} />
                      <Line type="monotone" dataKey="בסיס"      stroke="#c3cc8c" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                      <Line type="monotone" dataKey="בבית בתשלום"  stroke="#f4d35e" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                      <Line type="monotone" dataKey="משוחרר"    stroke="#f87171" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                      <Line type="monotone" dataKey="גימלים"    stroke="#60a5fa" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Bar chart — unit comparison (only if multiple units) */}
                {unitBarData.length > 1 && (
                  <div className="bg-surface-high rounded-lg p-4 border border-outline-variant">
                    <div className="text-xs font-mono font-bold text-primary mb-3">השוואת יחידות — % זמינות</div>
                    <div className="flex flex-col gap-2" dir="rtl">
                      {unitBarData.map((entry, idx) => {
                        const isWeak = idx === unitBarData.length - 1 && entry.pct < 80
                        const barColor = isWeak ? '#f4d35e' : '#c3cc8c'
                        return (
                          <div key={entry.unit}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-on-surface truncate">{entry.unit}</span>
                              <span className="text-xs font-mono font-bold shrink-0 mr-2" style={{ color: barColor }}>
                                {entry.pct}%
                              </span>
                            </div>
                            <div className="h-3 w-full bg-surface-container rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{ width: `${entry.pct}%`, backgroundColor: barColor }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Pie chart — status breakdown */}
                {pieData.length > 0 && (
                  <div className="bg-surface-high rounded-lg p-4 border border-outline-variant">
                    <div className="text-xs font-mono font-bold text-primary mb-3">התפלגות קודים</div>
                    <div className="flex items-center gap-4">
                      <PieChart width={110} height={110}>
                        <Pie
                          data={pieData}
                          dataKey="count"
                          innerRadius={32}
                          outerRadius={50}
                          paddingAngle={2}
                          startAngle={90}
                          endAngle={-270}
                        >
                          {pieData.map((entry, idx) => (
                            <Cell
                              key={entry.code}
                              fill={STATUS_COLORS[entry.code] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length]}
                            />
                          ))}
                        </Pie>
                      </PieChart>
                      <div className="flex-1 flex flex-col gap-1.5">
                        {pieData.map((entry, idx) => {
                          const pct = totalStatuses > 0 ? Math.round((entry.count / totalStatuses) * 100) : 0
                          const color = STATUS_COLORS[entry.code] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length]
                          const statusName = getStatus(entry.code)?.name ?? entry.code
                          return (
                            <div key={entry.code} className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                              <span className="text-xs text-on-surface-variant flex-1 truncate">{statusName}</span>
                              <span className="text-xs font-bold text-on-surface">{pct}%</span>
                              <span className="text-xs text-on-surface-variant w-8 text-left">{entry.count}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}
