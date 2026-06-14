import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { useDiaryData } from '@/features/diary/useDiaryData'
import { getStatus } from '@/domain/statuses'
import type { StatusEntry } from '@/domain/types'

// ── Period calculation ─────────────────────────────────────────────────────

type PeriodCategory = 'army' | 'home-paid' | 'home-free'

interface Period {
  category: PeriodCategory
  startDate: Date
  endDate: Date
  days: number
}

const PERIOD_META: Record<PeriodCategory, { label: string; color: string }> = {
  'army':      { label: 'בסיס',       color: '#c3cc8c' },
  'home-paid': { label: 'בית בתשלום', color: '#f4d35e' },
  'home-free': { label: 'משוחרר',     color: '#f87171' },
}

const DAY_MS = 24 * 60 * 60 * 1000

function categorize(code: string): PeriodCategory {
  const def = getStatus(code)
  if (!def || def.inArmy) return 'army'
  if (def.isPaid) return 'home-paid'
  return 'home-free'
}

function calculatePeriods(entries: StatusEntry[]): Period[] {
  if (entries.length === 0) return []

  const sorted = [...entries]
    .filter(e => e.code)
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  if (sorted.length === 0) return []

  const periods: Period[] = []
  let start  = sorted[0].date
  let cat    = categorize(sorted[0].code)
  let prev   = sorted[0].date

  for (let i = 1; i < sorted.length; i++) {
    const entry   = sorted[i]
    const entryCat = categorize(entry.code)
    const gap      = Math.round((entry.date.getTime() - prev.getTime()) / DAY_MS)

    // Break on category change OR date gap larger than 1 day
    if (entryCat !== cat || gap > 1) {
      periods.push({
        category: cat,
        startDate: start,
        endDate: prev,
        days: Math.round((prev.getTime() - start.getTime()) / DAY_MS) + 1,
      })
      start = entry.date
      cat   = entryCat
    }
    prev = entry.date
  }

  // Final period
  periods.push({
    category: cat,
    startDate: start,
    endDate: prev,
    days: Math.round((prev.getTime() - start.getTime()) / DAY_MS) + 1,
  })

  return periods.reverse() // most recent first
}

// ── SoldierScreen ──────────────────────────────────────────────────────────

export function SoldierScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, isLoading } = useDiaryData()

  const soldier = useMemo(() =>
    data?.soldiers.find(s => s.id === decodeURIComponent(id ?? '')),
    [data, id]
  )

  const entries = useMemo(() =>
    data?.statuses.filter(e => e.soldierId === soldier?.id) ?? [],
    [data, soldier]
  )

  const periods = useMemo(() => calculatePeriods(entries), [entries])

  const stats = useMemo(() => {
    const armyDays  = periods.filter(p => p.category === 'army').reduce((s, p) => s + p.days, 0)
    const homeDays  = periods.filter(p => p.category !== 'army').reduce((s, p) => s + p.days, 0)
    const totalDays = armyDays + homeDays
    const pct       = totalDays > 0 ? Math.round((armyDays / totalDays) * 100) : 0
    return { armyDays, homeDays, totalDays, pct }
  }, [periods])

  const fmtDate = (d: Date) => format(d, 'dd.MM.yy')

  return (
    <div dir="rtl" className="flex flex-col h-screen overflow-hidden">

      {/* Header */}
      <header className="sticky top-0 z-10 bg-surface-container border-b border-outline-variant px-4 py-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-primary mb-1"
        >
          ‹ חזרה
        </button>
        <h1 className="text-lg font-bold text-on-surface">
          {soldier?.name ?? decodeURIComponent(id ?? '')}
        </h1>
        {soldier && (
          <div className="text-xs font-mono text-on-surface-variant mt-0.5">
            {[soldier.rank, soldier.unit, soldier.team, soldier.role].filter(Boolean).join(' • ')}
          </div>
        )}
      </header>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center text-on-surface-variant font-mono text-sm">
          טוען...
        </div>
      )}

      {!soldier && !isLoading && (
        <div className="m-4 text-on-surface-variant text-sm text-center py-8">חייל לא נמצא</div>
      )}

      {soldier && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Details card */}
          {(soldier.phone || Object.keys(soldier.extra).length > 0) && (
            <div className="bg-surface-high border border-outline-variant rounded-lg p-4">
              <h2 className="text-[11px] font-mono font-bold text-primary uppercase tracking-wider mb-3">פרטים</h2>
              {soldier.phone && (
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-on-surface font-mono">{soldier.phone}</span>
                  <span className="text-on-surface-variant">טלפון</span>
                </div>
              )}
              {Object.entries(soldier.extra).map(([key, val]) => (
                <div key={key} className="flex justify-between text-sm mb-1">
                  <span className="text-on-surface font-mono">{val}</span>
                  <span className="text-on-surface-variant">{key}</span>
                </div>
              ))}
            </div>
          )}

          {/* Summary stats */}
          {stats.totalDays > 0 && (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-surface-high border border-outline-variant rounded-lg p-3 text-center">
                <div className="text-2xl font-bold" style={{ color: '#c3cc8c' }}>{stats.armyDays}</div>
                <div className="text-[10px] font-mono text-on-surface-variant mt-0.5">ימי בסיס</div>
              </div>
              <div className="bg-surface-high border border-outline-variant rounded-lg p-3 text-center">
                <div className="text-2xl font-bold" style={{ color: '#f4d35e' }}>{stats.homeDays}</div>
                <div className="text-[10px] font-mono text-on-surface-variant mt-0.5">ימי בית</div>
              </div>
              <div className="bg-primary-container rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-on-primary-container">{stats.pct}%</div>
                <div className="text-[10px] font-mono text-on-primary-container/70 mt-0.5">זמינות</div>
              </div>
            </div>
          )}

          {/* Periods list */}
          <div>
            <h2 className="text-[11px] font-mono font-bold text-primary uppercase tracking-wider mb-2">
              תקופות שירות
            </h2>

            {periods.length === 0 && (
              <p className="text-sm text-outline text-center py-6 font-mono">אין היסטוריה</p>
            )}

            <div className="space-y-1.5">
              {periods.map((period, idx) => {
                const meta = PERIOD_META[period.category]
                const sameDay = period.startDate.getTime() === period.endDate.getTime()
                return (
                  <div
                    key={idx}
                    className="flex items-center bg-surface-high border border-outline-variant rounded-lg overflow-hidden"
                  >
                    {/* Color bar */}
                    <div className="w-1 self-stretch shrink-0" style={{ backgroundColor: meta.color }} />

                    {/* Content */}
                    <div className="flex items-center gap-3 flex-1 px-3 py-2.5">
                      {/* Label */}
                      <span className="text-sm font-bold shrink-0" style={{ color: meta.color }}>
                        {meta.label}
                      </span>

                      {/* Date range */}
                      <span className="text-xs font-mono text-on-surface-variant flex-1 text-left" dir="ltr">
                        {sameDay
                          ? fmtDate(period.startDate)
                          : `${fmtDate(period.startDate)} – ${fmtDate(period.endDate)}`}
                      </span>

                      {/* Days count */}
                      <span className="text-xs font-mono font-bold text-on-surface shrink-0">
                        {period.days} י׳
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
