import { useMemo, useRef, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { format } from 'date-fns'
import { useDiaryData } from '@/features/diary/useDiaryData'

const TIME_TABS = ['שבועי', 'חודשי', 'כל הזמן'] as const
type TimeTab = typeof TIME_TABS[number]

const PERIOD_DAYS: Record<TimeTab, number | null> = {
  'שבועי': 7,
  'חודשי': 30,
  'כל הזמן': null,
}

const PRESENT_CODE = 'נ'

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Period segmented slider ────────────────────────────────────────────────
//
// RTL layout: TIME_TABS[0] (שבועי) renders on the RIGHT, TIME_TABS[2] on the LEFT.
// The sliding pill's CSS left% = (n-1-activeIdx)/(n-1) * segmentWidth because
// RTL flex reverses visual order while CSS coordinates remain LTR.

function PeriodSlider({ value, onChange }: { value: TimeTab; onChange: (t: TimeTab) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const n = TIME_TABS.length
  const activeIdx = TIME_TABS.indexOf(value)

  function idxFromClientX(clientX: number): number {
    if (!containerRef.current) return activeIdx
    const { left, width } = containerRef.current.getBoundingClientRect()
    // In RTL: right side = index 0, left side = index n-1
    const fractionFromRight = 1 - Math.max(0, Math.min(1, (clientX - left) / width))
    return Math.round(fractionFromRight * (n - 1))
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    onChange(TIME_TABS[idxFromClientX(e.clientX)])
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.buttons === 0) return
    onChange(TIME_TABS[idxFromClientX(e.clientX)])
  }

  // Pill left% in LTR CSS coords: index 0 (שבועי, rightmost) → leftmost CSS left ≈ 66%
  const pillLeftPct = ((n - 1 - activeIdx) / (n - 1)) * (100 - 100 / n)

  return (
    <div className="px-4 py-3">
      <div
        ref={containerRef}
        className="relative flex bg-surface-high rounded-lg p-1 cursor-pointer touch-none"
        dir="rtl"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
        {/* Sliding pill */}
        <div
          className="absolute inset-y-1 rounded-md bg-primary-container"
          style={{
            width: `calc(${100 / n}% - 8px)`,
            left: `calc(${pillLeftPct}% + 4px)`,
            transition: 'left 150ms ease',
          }}
        />

        {/* Labels — each 1/3 width, pointer events none so the container handles drags */}
        {TIME_TABS.map(tab => (
          <span
            key={tab}
            className={`relative flex-1 text-sm py-2.5 text-center font-bold z-10 pointer-events-none select-none transition-colors duration-150 ${
              tab === value ? 'text-on-primary-container' : 'text-on-surface-variant'
            }`}
          >
            {tab}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── TrendsScreen ───────────────────────────────────────────────────────────

export function TrendsScreen() {
  const { data, isLoading } = useDiaryData()
  const [activeTab, setActiveTab] = useState<TimeTab>('שבועי')

  // Compute cutoff as a dateKey string ("YYYY-MM-DD") — safer than Date comparison
  const cutoffDateKey = useMemo(() => {
    const days = PERIOD_DAYS[activeTab]
    if (days === null) return null
    const d = new Date()
    d.setDate(d.getDate() - days)
    return toDateKey(d)
  }, [activeTab])

  const chartData = useMemo(() => {
    if (!data) return []

    // Debug: remove after confirming filter works
    const allKeys = [...new Set(data.statuses.map(e => e.dateKey))].sort()
    console.log('[Trends] tab:', activeTab, '| cutoff:', cutoffDateKey, '| dateKeys:', allKeys)

    const totalByDate = new Map<string, { date: Date; total: number; present: number }>()

    for (const entry of data.statuses) {
      if (!entry.dateKey) continue
      // Filter: skip entries older than the cutoff date
      if (cutoffDateKey && entry.dateKey < cutoffDateKey) continue

      if (!totalByDate.has(entry.dateKey)) {
        totalByDate.set(entry.dateKey, { date: entry.date, total: 0, present: 0 })
      }
      const row = totalByDate.get(entry.dateKey)!
      row.total += 1
      if (entry.code === PRESENT_CODE) row.present += 1
    }

    return Array.from(totalByDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, { date, total, present }]) => ({
        label: format(date, 'dd/MM'),
        נוכח: present,
        חוץ: total - present,
        _total: total,
      }))
  }, [data, cutoffDateKey])

  const { presentAvg, absentAvg, totalAvg } = useMemo(() => {
    if (chartData.length === 0) return { presentAvg: 0, absentAvg: 0, totalAvg: 0 }
    const n = chartData.length
    return {
      presentAvg: Math.round(chartData.reduce((s, d) => s + d.נוכח, 0) / n),
      absentAvg:  Math.round(chartData.reduce((s, d) => s + d.חוץ, 0) / n),
      totalAvg:   Math.round(chartData.reduce((s, d) => s + d._total, 0) / n),
    }
  }, [chartData])

  const availabilityPct = totalAvg > 0 ? Math.round((presentAvg / totalAvg) * 100) : 0

  return (
    <div className="flex flex-col flex-1 overflow-hidden" dir="rtl">
      {/* Period selector */}
      <PeriodSlider value={activeTab} onChange={setActiveTab} />

      {isLoading && (
        <div className="flex-1 flex items-center justify-center text-on-surface-variant font-mono text-sm">
          טוען...
        </div>
      )}

      {data && (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {chartData.length === 0 ? (
            <div className="text-center text-on-surface-variant text-sm py-12">
              אין נתונים ל{activeTab}
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}>
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
                  <Line type="monotone" dataKey="נוכח" stroke="#c3cc8c" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="חוץ"  stroke="#f4d35e" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>

              <div className="flex gap-3">
                <div className="bg-primary-container rounded-lg p-4 flex-1 text-center">
                  <div className="text-4xl font-bold text-on-primary-container">{presentAvg}</div>
                  <div className="text-xs font-mono text-on-primary-container/70 mt-1">ממוצע נוכח</div>
                </div>
                <div className="bg-surface-high rounded-lg p-4 flex-1 text-center border border-outline-variant">
                  <div className="text-4xl font-bold text-on-surface">{absentAvg}</div>
                  <div className="text-xs font-mono text-on-surface-variant mt-1">ממוצע חוץ</div>
                </div>
              </div>

              <div className="bg-surface-container border border-outline-variant rounded-lg p-4 flex items-center justify-between">
                <div className="text-xs font-mono text-on-surface-variant">שיעור זמינות</div>
                <div className="text-4xl font-bold text-primary">{availabilityPct}%</div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
