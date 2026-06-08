import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { format } from 'date-fns'
import { useDiaryData } from '@/features/diary/useDiaryData'
import { ALL_STATUSES } from '@/domain/statusVocabulary'

export function TrendsScreen() {
  const navigate = useNavigate()
  const { data, isLoading } = useDiaryData()

  const chartData = useMemo(() => {
    if (!data) return []

    // Group status counts by dateKey
    const byDate = new Map<string, { date: Date; counts: Record<string, number> }>()
    for (const entry of data.statuses) {
      if (!entry.code) continue
      if (!byDate.has(entry.dateKey)) {
        byDate.set(entry.dateKey, { date: entry.date, counts: {} })
      }
      const row = byDate.get(entry.dateKey)!
      row.counts[entry.code] = (row.counts[entry.code] ?? 0) + 1
    }

    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, { date, counts }]) => ({
        label: format(date, 'dd/MM'),
        ...counts,
      }))
  }, [data])

  // Only show statuses that actually appear in the data
  const activeCodes = useMemo(() => {
    const seen = new Set<string>()
    for (const row of chartData) {
      for (const key of Object.keys(row)) {
        if (key !== 'label') seen.add(key)
      }
    }
    return ALL_STATUSES.filter(s => seen.has(s.code))
  }, [chartData])

  // navigate is available for future use (e.g. clicking a bar to drill down)
  void navigate

  return (
    <div className="flex flex-col min-h-screen pb-16">
      <header className="sticky top-0 z-10 bg-surface-container border-b border-outline-variant px-4 py-3">
        <h1 className="text-headline-sm font-bold text-primary">מגמות זמינות</h1>
      </header>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center text-on-surface-variant font-mono text-sm">
          טוען...
        </div>
      )}

      {data && (
        <div className="flex-1 p-4">
          {chartData.length === 0 ? (
            <div className="text-center text-on-surface-variant text-sm py-12">אין נתונים להצגה</div>
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#c8c7b8', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  axisLine={{ stroke: '#47483c' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#c8c7b8', fontSize: 11, fontFamily: 'JetBrains Mono' }}
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
                {activeCodes.map(status => (
                  <Bar
                    key={status.code}
                    dataKey={status.code}
                    name={status.label}
                    stackId="a"
                    fill={status.bg}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-2">
            {activeCodes.map(s => (
              <div key={s.code} className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                <span
                  className="inline-block w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: s.bg }}
                />
                {s.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
