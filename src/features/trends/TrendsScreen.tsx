import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  PieChart, Pie, Cell,
  useIsTooltipActive, useActiveTooltipCoordinate, useActiveTooltipDataPoints, useActiveTooltipLabel,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
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
import { setActiveView, clearActiveView } from '@/contexts/ActiveViewContext'

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

// ── Time range slider (pan-only, day-count pills) ─────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000

const DAY_OPTIONS: { label: string; days: number | null }[] = [
  { label: '7', days: 7 },
  { label: '14', days: 14 },
  { label: 'חודש', days: 30 },
  { label: 'הכל', days: null },
]

function TimeRangeSlider({
  minMs, maxMs, endMs, days, onEndChange, onDaysChange,
}: {
  minMs: number; maxMs: number
  endMs: number
  days: number | null
  onEndChange: (ms: number) => void
  onDaysChange: (d: number | null) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ originX: number; originEndMs: number } | null>(null)

  const totalMs = maxMs - minMs
  if (totalMs <= 0) return null

  const spanMs = days !== null ? days * DAY_MS : totalMs
  const startMs = Math.max(minMs, endMs - spanMs)
  const startPct = ((startMs - minMs) / totalMs) * 100
  const endPct   = ((endMs   - minMs) / totalMs) * 100
  const displayDays = Math.max(1, Math.round((endMs - startMs) / DAY_MS))

  function msPerPx() {
    return trackRef.current ? totalMs / trackRef.current.getBoundingClientRect().width : 0
  }

  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    if (days === null) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    drag.current = { originX: e.clientX, originEndMs: endMs }
  }

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const delta = (e.clientX - drag.current.originX) * msPerPx()
    const newEnd = Math.min(maxMs, Math.max(minMs + spanMs, drag.current.originEndMs + delta))
    onEndChange(newEnd)
  }

  function onUp() { drag.current = null }

  return (
    <div className="px-1 py-1" dir="rtl">
      {/* Day-count pills */}
      <div className="flex gap-1 mb-2">
        {DAY_OPTIONS.map(opt => (
          <button
            key={opt.label}
            onClick={() => onDaysChange(opt.days)}
            className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold transition-colors ${
              days === opt.days
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-high'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        dir="ltr"
        className="relative h-8 flex items-center select-none"
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        <div className="absolute inset-x-0 h-1.5 bg-surface-container rounded-full" />
        <div
          className={`absolute h-6 rounded-full bg-primary/20 touch-none ${days !== null ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
          style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
          onPointerDown={onDown}
        />
      </div>

      {/* Labels */}
      <div dir="ltr" className="flex justify-between text-[10px] font-mono text-on-surface-variant -mt-0.5">
        <span>{format(new Date(minMs), 'dd/MM/yy')}</span>
        <span className="text-primary font-bold">
          {format(new Date(startMs), 'dd/MM')} – {format(new Date(endMs), 'dd/MM')} · {displayDays}י
        </span>
        <span>{format(new Date(maxMs), 'dd/MM/yy')}</span>
      </div>
    </div>
  )
}

// ── Active dot that renders the value as an SVG label next to the dot ─────

function ActiveDotLabel({ cx, cy, fill, value, dataKey, selectedLine, onToggle }: {
  cx?: number; cy?: number; fill: string; value?: number
  dataKey?: string; selectedLine: string | null; onToggle: (key: string) => void
}) {
  if (cx == null || cy == null || value == null) return null
  const isSelected = selectedLine === null || selectedLine === dataKey
  return (
    <g style={{ cursor: 'pointer' }} onClick={() => dataKey && onToggle(dataKey)}>
      <circle cx={cx} cy={cy} r={5} fill={fill} opacity={isSelected ? 1 : 0.3} />
      {isSelected && (
        <text
          x={cx}
          y={cy - 10}
          fill={fill}
          fontSize={13}
          fontWeight="bold"
          fontFamily="JetBrains Mono"
          textAnchor="middle"
          dominantBaseline="auto"
        >
          {value}
        </text>
      )}
    </g>
  )
}

// ── Tooltip date bridge — lives inside LineChart to access recharts v3 store ──

// useActiveTooltipDataPoints returns the raw row objects (not recharts payload items)
type RawRow = { date: Date }

type ActiveDate = { label: string; dateKey: string; x: number }

function TooltipStateCapture({ onShow, onHide }: {
  onShow: (d: ActiveDate) => void
  onHide: () => void
}) {
  const isActive = useIsTooltipActive()
  const coordinate = useActiveTooltipCoordinate()
  const dataPoints = useActiveTooltipDataPoints() as RawRow[] | undefined
  const label = useActiveTooltipLabel()

  const onShowRef = useRef(onShow)
  const onHideRef = useRef(onHide)
  onShowRef.current = onShow
  onHideRef.current = onHide

  const dataPointsRef = useRef(dataPoints)
  dataPointsRef.current = dataPoints
  const coordinateRef = useRef(coordinate)
  coordinateRef.current = coordinate

  const labelStr = String(label ?? '')
  const x = coordinate?.x ?? -1

  useEffect(() => {
    const row = dataPointsRef.current?.[0]
    if (isActive && row?.date) {
      onShowRef.current({ label: labelStr, dateKey: toDateKey(row.date), x: coordinateRef.current?.x ?? 0 })
    } else if (!isActive) {
      onHideRef.current()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, x, labelStr])

  return null
}

// ── TrendsScreen ───────────────────────────────────────────────────────────

export function TrendsScreen() {
  const { data, isLoading } = useDiaryData()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [selectedDays, setSelectedDays] = useState<number | null>(7)
  const [windowEndMs, setWindowEndMs] = useState<number | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterState, setFilterState] = useState<FilterState>(emptyFilterState())
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const { saveView: persistView } = useSavedViews()
  const viewBaseRef = useRef<FilterState | null>(null)
  const [activeDate, setActiveDate] = useState<ActiveDate | null>(null)
  const iconHoveredRef = useRef(false)
  const hideDateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleDateShow = useCallback((d: ActiveDate) => {
    if (hideDateTimerRef.current) { clearTimeout(hideDateTimerRef.current); hideDateTimerRef.current = null }
    setActiveDate(d)
  }, [])
  const handleDateHide = useCallback(() => {
    hideDateTimerRef.current = setTimeout(() => {
      if (!iconHoveredRef.current) setActiveDate(null)
    }, 120)
  }, [])
  const [selectedLine, setSelectedLine] = useState<string | null>(null)
  const toggleLine = useCallback((key: string) => setSelectedLine(prev => prev === key ? null : key), [])

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

  // Apply pending filter from sidebar navigation (also fires when re-navigating to same route)
  useEffect(() => {
    const state = location.state as { pendingFilter?: FilterState; viewName?: string } | null
    const pending = state?.pendingFilter
    if (!pending) return
    viewBaseRef.current = pending
    setFilterState(pending)
    setActiveView(state?.viewName ?? null)
    navigate(location.pathname, { replace: true, state: null })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  // Deselect active view when filter diverges from the saved base
  useEffect(() => {
    if (!viewBaseRef.current || filterState === viewBaseRef.current) return
    viewBaseRef.current = null
    clearActiveView()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterState])

  // Apply filter from shared URL param on mount only
  useEffect(() => {
    const encoded = searchParams.get('filter')
    if (encoded) {
      const decoded = decodeFilterState(encoded)
      if (decoded) setFilterState(decoded)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleDaysChange(days: number | null) {
    setSelectedDays(days)
    setWindowEndMs(null) // reset to latest data point
  }

  // Derive effective window
  const effectiveEndMs   = windowEndMs ?? maxMs
  const effectiveStartMs = selectedDays !== null
    ? Math.max(minMs, effectiveEndMs - selectedDays * DAY_MS)
    : minMs

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
        onClearAll={() => { setFilterState(emptyFilterState()); viewBaseRef.current = null; clearActiveView() }}
        onSaveRequest={() => setSaveDialogOpen(true)}
      />
      <SaveViewDialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        onSave={async (name) => { await persistView({ name, view: '/trends', filterState }) }}
      />

      <div className="flex flex-col flex-1 overflow-hidden" dir="rtl">
        {/* Toolbar: filter button only */}
        <div className="px-4 py-3 flex items-center justify-end">
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
                אין נתונים
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
                      endMs={effectiveEndMs}
                      days={selectedDays}
                      onEndChange={ms => setWindowEndMs(ms)}
                      onDaysChange={handleDaysChange}
                    />
                  </div>
                )}

                {/* Line chart — trend over time */}
                <div className="bg-surface-high rounded-lg p-4 border border-outline-variant">
                  <div className="text-xs font-mono font-bold text-primary mb-3">מגמה לאורך זמן</div>
                  <div className="relative pt-14">
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
                      <Tooltip content={() => null} />
                      <TooltipStateCapture onShow={handleDateShow} onHide={handleDateHide} />
                      <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'Public Sans', color: '#c8c7b8', paddingTop: 8 }} />
                      {([
                        { key: 'בסיס',        color: '#c3cc8c' },
                        { key: 'בבית בתשלום', color: '#f4d35e' },
                        { key: 'משוחרר',      color: '#f87171' },
                        { key: 'גימלים',      color: '#60a5fa' },
                      ] as const).map(({ key, color }) => {
                        const dimmed = selectedLine !== null && selectedLine !== key
                        return (
                          <Line
                            key={key}
                            type="monotone"
                            dataKey={key}
                            stroke={color}
                            strokeWidth={dimmed ? 1 : 2}
                            strokeOpacity={dimmed ? 0.25 : 1}
                            dot={false}
                            activeDot={(p: any) => (
                              <ActiveDotLabel {...p} fill={color} selectedLine={selectedLine} onToggle={toggleLine} />
                            )}
                          />
                        )
                      })}
                    </LineChart>
                  </ResponsiveContainer>

                  {activeDate && (
                    <button
                      onClick={() => navigate(`/diary/${activeDate.dateKey}`)}
                      style={{
                        position: 'absolute',
                        left: activeDate.x,
                        top: 6,
                        transform: 'translateX(-50%)',
                        zIndex: 10,
                      }}
                      className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-container text-on-primary-container hover:bg-primary hover:text-on-primary transition-colors shadow-md"
                      title={`עבור ל-${activeDate.label}`}
                      onMouseEnter={() => {
                        iconHoveredRef.current = true
                        if (hideDateTimerRef.current) { clearTimeout(hideDateTimerRef.current); hideDateTimerRef.current = null }
                      }}
                      onMouseLeave={() => { iconHoveredRef.current = false; setActiveDate(null) }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15 3 21 3 21 9"/>
                        <line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                    </button>
                  )}
                  </div>
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
