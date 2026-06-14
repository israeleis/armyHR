import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import { useDiaryData } from '@/features/diary/useDiaryData'
import { getStatus } from '@/domain/statuses'
import { StatusBadge } from '@/components/StatusBadge'
import type { StatusEntry } from '@/domain/types'

// ── Period calculation ─────────────────────────────────────────────────────

type PeriodCategory = 'army' | 'home-paid' | 'home-free' | 'sick' | 'organizing'

interface Period {
  category: PeriodCategory
  startDate: Date
  endDate: Date
  days: number
  entries: StatusEntry[]
}

const PERIOD_META: Record<PeriodCategory, { label: string; color: string }> = {
  'army':       { label: 'בסיס',            color: '#c3cc8c' },
  'home-paid':  { label: 'בית בתשלום',      color: '#f4d35e' },
  'home-free':  { label: 'משוחרר',          color: '#f87171' },
  'sick':       { label: 'מחלה',            color: '#60a5fa' },
  'organizing': { label: 'ימי התארגנות',    color: '#e08a3c' },
}

const DAY_MS = 24 * 60 * 60 * 1000

function categorize(code: string, released: boolean): PeriodCategory {
  if (code === 'ג') return 'sick'
  if (code === 'מ') return 'organizing'
  if (released) return 'home-free'
  const def = getStatus(code)
  if (def?.inArmy) return 'army'
  if (def?.isPaid) return 'home-paid'
  return 'home-free'
}

function calculatePeriods(entries: StatusEntry[]): Period[] {
  if (entries.length === 0) return []

  const sorted = [...entries]
    .filter(e => e.code)
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  if (sorted.length === 0) return []

  const periods: Period[] = []
  let released = false

  let start        = sorted[0].date
  let cat          = categorize(sorted[0].code, released)
  let prev         = sorted[0].date
  let periodEntries: StatusEntry[] = [sorted[0]]

  if (sorted[0].code === 'ל') released = true

  for (let i = 1; i < sorted.length; i++) {
    const entry = sorted[i]
    const gap   = Math.round((entry.date.getTime() - prev.getTime()) / DAY_MS)

    if (entry.code === 'פ' || getStatus(entry.code)?.inArmy) released = false

    const entryCat = categorize(entry.code, released)

    if (entryCat !== cat || gap > 1) {
      periods.push({
        category: cat,
        startDate: start,
        endDate: prev,
        days: Math.round((prev.getTime() - start.getTime()) / DAY_MS) + 1,
        entries: periodEntries,
      })
      start = entry.date
      cat   = entryCat
      periodEntries = []
    }

    periodEntries.push(entry)
    prev = entry.date

    if (entry.code === 'ל') released = true
  }

  periods.push({
    category: cat,
    startDate: start,
    endDate: prev,
    days: Math.round((prev.getTime() - start.getTime()) / DAY_MS) + 1,
    entries: periodEntries,
  })

  return periods.reverse()
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

  const [sortAsc, setSortAsc]         = useState(false)
  const [expanded, setExpanded]       = useState<Set<number>>(new Set())

  const periods = useMemo(() => {
    const p = calculatePeriods(entries)
    return sortAsc ? [...p].reverse() : p
  }, [entries, sortAsc])

  const allExpanded = periods.length > 0 && expanded.size === periods.length

  function togglePeriod(idx: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  function toggleAll() {
    setExpanded(allExpanded ? new Set() : new Set(periods.map((_, i) => i)))
  }

  const stats = useMemo(() => {
    // Focus on paid days only (ignore משוחרר unpaid days)
    const armyDays     = periods.filter(p => p.category === 'army').reduce((s, p) => s + p.days, 0)
    const homePaidDays = periods.filter(p => ['home-paid', 'sick', 'organizing'].includes(p.category)).reduce((s, p) => s + p.days, 0)
    const totalPaid    = armyDays + homePaidDays
    const pct          = totalPaid > 0 ? Math.round((armyDays / totalPaid) * 100) : 0
    return { armyDays, homePaidDays, totalPaid, pct }
  }, [periods])

  const fmtDate  = (d: Date) => format(d, 'dd.MM.yy')
  const fmtDays  = (n: number) => n === 1 ? 'יום אחד' : `${n} ימים`

  return (
    <div dir="rtl" className="flex flex-col h-screen overflow-hidden">

      {/* Header */}
      <header className="sticky top-0 z-10 bg-surface-container border-b border-outline-variant px-4 py-3">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-primary mb-1">
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
        <div className="flex-1 flex items-center justify-center text-on-surface-variant font-mono text-sm">טוען...</div>
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

          {/* Summary stats — paid days only */}
          {stats.totalPaid > 0 && (
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-surface-high border border-outline-variant rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-on-surface">{stats.totalPaid}</div>
                <div className="text-[10px] font-mono text-on-surface-variant mt-0.5">סה״כ</div>
              </div>
              <div className="bg-surface-high border border-outline-variant rounded-lg p-3 text-center">
                <div className="text-2xl font-bold" style={{ color: '#c3cc8c' }}>{stats.armyDays}</div>
                <div className="text-[10px] font-mono text-on-surface-variant mt-0.5">בסיס</div>
              </div>
              <div className="bg-surface-high border border-outline-variant rounded-lg p-3 text-center">
                <div className="text-2xl font-bold" style={{ color: '#f4d35e' }}>{stats.homePaidDays}</div>
                <div className="text-[10px] font-mono text-on-surface-variant mt-0.5">בית</div>
              </div>
              <div className="bg-primary-container rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-on-primary-container">{stats.pct}%</div>
                <div className="text-[10px] font-mono text-on-primary-container/70 mt-0.5">בסיס</div>
              </div>
            </div>
          )}

          {/* Periods list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[11px] font-mono font-bold text-primary uppercase tracking-wider">
                תקופות שירות
              </h2>
              <div className="flex items-center gap-3">
                {/* Expand / collapse all */}
                {periods.length > 0 && (
                  <button
                    onClick={toggleAll}
                    className="text-on-surface-variant hover:text-on-surface transition-colors"
                    title={allExpanded ? 'כווץ הכל' : 'הרחב הכל'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {allExpanded
                        ? <><polyline points="4 14 10 8 16 14"/><polyline points="4 20 10 14 16 20"/></>
                        : <><polyline points="4 4 10 10 16 4"/><polyline points="4 10 10 16 16 10"/></>
                      }
                    </svg>
                  </button>
                )}
                {/* Sort direction */}
                <button
                  onClick={() => setSortAsc(a => !a)}
                  className="flex items-center gap-1 text-[11px] font-mono text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  {sortAsc ? 'ישן → חדש' : 'חדש → ישן'}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: sortAsc ? 'scaleY(-1)' : 'none' }}>
                    <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
                  </svg>
                </button>
              </div>
            </div>

            {periods.length === 0 && (
              <p className="text-sm text-outline text-center py-6 font-mono">אין היסטוריה</p>
            )}

            <div className="space-y-1.5">
              {periods.map((period, idx) => {
                const meta      = PERIOD_META[period.category]
                const sameDay   = period.startDate.getTime() === period.endDate.getTime()
                const isOpen    = expanded.has(idx)
                const dayEntries = sortAsc
                  ? [...period.entries].sort((a, b) => a.date.getTime() - b.date.getTime())
                  : [...period.entries].sort((a, b) => b.date.getTime() - a.date.getTime())

                return (
                  <div key={idx} className="bg-surface-high border border-outline-variant rounded-lg overflow-hidden">
                    {/* Period row — clickable */}
                    <button
                      onClick={() => togglePeriod(idx)}
                      className="w-full flex items-center text-right"
                    >
                      {/* Color bar */}
                      <div className="w-1 self-stretch shrink-0" style={{ backgroundColor: meta.color }} />

                      {/* Content */}
                      <div className="flex items-center gap-3 flex-1 px-3 py-2.5">
                        <span className="text-sm font-bold shrink-0" style={{ color: meta.color }}>
                          {meta.label}
                        </span>
                        <span className="text-xs font-mono text-on-surface-variant flex-1 text-left" dir="ltr">
                          {sameDay
                            ? fmtDate(period.startDate)
                            : `${fmtDate(period.startDate)} – ${fmtDate(period.endDate)}`}
                        </span>
                        <span className="text-xs font-mono font-bold shrink-0" style={{ color: meta.color }}>
                          {fmtDays(period.days)}
                        </span>
                        <svg
                          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                          className="text-on-surface-variant shrink-0 transition-transform duration-150"
                          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                        >
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </div>
                    </button>

                    {/* Expanded day entries */}
                    {isOpen && (
                      <div className="border-t border-outline-variant divide-y divide-outline-variant/50">
                        {dayEntries.map(entry => {
                          const statusDef = getStatus(entry.code)
                          return (
                            <div
                              key={entry.dateKey}
                              className="flex items-center justify-between px-4 py-2"
                            >
                              <StatusBadge code={entry.code} size="sm" />
                              <div className="text-right">
                                <div className="text-xs font-mono text-on-surface">
                                  {format(entry.date, 'dd.MM.yy')}
                                </div>
                                <div className="text-[10px] text-on-surface-variant">
                                  {format(entry.date, 'EEEE', { locale: he })}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
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
