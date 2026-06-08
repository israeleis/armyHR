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

// ── Period slider ──────────────────────────────────────────────────────────

function PeriodSlider({ value, onChange }: { value: TimeTab; onChange: (t: TimeTab) => void }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const maxIdx = TIME_TABS.length - 1
  const activeIdx = TIME_TABS.indexOf(value)

  // RTL layout: index 0 (שבועי) = rightmost, index maxIdx (כל הזמן) = leftmost
  // thumb left% = (maxIdx - activeIdx) / maxIdx * 100
  const leftPct = ((maxIdx - activeIdx) / maxIdx) * 100

  function idxFromClientX(clientX: number): number {
    if (!trackRef.current) return activeIdx
    const { left, width } = trackRef.current.getBoundingClientRect()
    // RTL: right side = low index (שבועי), left side = high index (כל הזמן)
    const fractionFromRight = 1 - Math.max(0, Math.min(1, (clientX - left) / width))
    return Math.round(fractionFromRight * maxIdx)
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    onChange(TIME_TABS[idxFromClientX(e.clientX)])
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.buttons === 0) return
    onChange(TIME_TABS[idxFromClientX(e.clientX)])
  }

  return (
    <div className="px-6 pb-4 pt-2 select-none" dir="rtl">
      {/* Labels */}
      <div className="flex justify-between mb-3">
        {TIME_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            className={`text-sm transition-colors ${
              tab === value ? 'text-primary font-bold' : 'text-on-surface-variant font-medium'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        className="relative h-[3px] bg-outline-variant rounded-full cursor-pointer"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
        {/* Fill: from right (שבועי) to thumb — grows as period widens */}
        <div
          className="absolute right-0 top-0 h-full bg-primary rounded-full transition-[width] duration-150"
          style={{ width: `${100 - leftPct}%` }}
        />

        {/* Stop dots */}
        {TIME_TABS.map((_, i) => {
          const dotLeft = ((maxIdx - i) / maxIdx) * 100
          return (
            <div
              key={i}
              className={`absolute top-1/2 w-2 h-2 rounded-full transition-colors duration-150 ${
                i <= activeIdx ? 'bg-outline-variant' : 'bg-primary'
              }`}
              style={{ left: `${dotLeft}%`, transform: 'translate(-50%, -50%)' }}
            />
          )
        })}

        {/* Thumb */}
        <div
          className="absolute top-1/2 w-5 h-5 rounded-full bg-primary shadow-md
            cursor-grab active:cursor-grabbing transition-[left] duration-150"
          style={{ left: `${leftPct}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>
    </div>
  )
}

// ── TrendsScreen ───────────────────────────────────────────────────────────

export function TrendsScreen() {
  const { data, isLoading } = useDiaryData()
  const [activeTab, setActiveTab] = useState<TimeTab>('שבועי')

  const cutoffDate = useMemo(() => {
    const days = PERIOD_DAYS[activeTab]
    if (days === null) return null
    const d = new Date()
    d.setDate(d.getDate() - days)
    d.setHours(0, 0, 0, 0)
    return d
  }, [activeTab])

  const chartData = useMemo(() => {
    if (!data) return []

    const totalByDate = new Map<string, { date: Date; total: number; present: number }>()

    for (const entry of data.statuses) {
      if (!entry.dateKey) continue
      if (cutoffDate && entry.date < cutoffDate) continue   // ← actual filtering

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
  }, [data, cutoffDate])

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
      {/* Period slider */}
      <PeriodSlider value={activeTab} onChange={setActiveTab} />

      {isLoading && (
        <div className="flex-1 flex items-center justify-center text-on-surface-variant font-mono text-sm">
          טוען...
        </div>
      )}

      {data && (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {chartData.length === 0 ? (
            <div className="text-center text-on-surface-variant text-sm py-12">אין נתונים להצגה</div>
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

              {/* Stats */}
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
