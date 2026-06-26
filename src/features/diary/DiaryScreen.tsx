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

const SUMMARY_GROUPS = [
  { label: 'נוכח',      codes: ['נ'],                          color: '#66ff33' },
  { label: 'בית',       codes: ['ב', 'חול'],                   color: '#f3cfc6' },
  { label: 'חולים',     codes: ['ג', 'ת'],                     color: '#f5cac3' },
  { label: 'בדרכים',   codes: ['י', 'ח', 'יח', 'חי', 'מ', 'פ', 'ל'], color: '#f4d35e' },
]

export function DiaryScreen() {
  const { isSignedIn } = useAuth()
  const { data, isLoading, error } = useDiaryData()
  const navigate = useNavigate()
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterState, setFilterState] = useState<FilterState>(emptyFilterState())
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)
  const carouselRef = useRef<HTMLDivElement>(null)
  const today = startOfToday()

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
    [statusCounts]
  )

  const totalCount = summaryGroups.reduce((s, g) => s + g.count, 0)
  const donutData = summaryGroups.filter(g => g.count > 0)

  const previewSoldiers = useMemo(() =>
    activeDateStatuses
      .filter(e => e.code)
      .slice(0, 6),
    [activeDateStatuses]
  )

  // Scroll carousel to active date
  useEffect(() => {
    if (!carouselRef.current) return
    const idx = dates.findIndex(d => toDateKey(d) === activeDateKey)
    if (idx < 0) return
    const el = carouselRef.current.children[idx] as HTMLElement | undefined
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [activeDateKey, dates])

  if (!isSignedIn) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
        <p className="text-on-surface-variant text-sm">נדרשת כניסה</p>
        <Link to="/signin" className="text-primary font-bold underline">כניסה</Link>
      </div>
    )
  }

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
    />
    <div dir="rtl" className="flex flex-col flex-1 overflow-hidden bg-background">
      {/* Toolbar */}
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
            {/* Section header: label RIGHT (start in RTL), year LEFT (end in RTL) */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">ציר זמן תאריכים</span>
              <span className="text-xs font-mono text-on-surface-variant">
                {format(activeDate, 'yyyy', { locale: he })}
              </span>
            </div>
            {/* RTL carousel: scroll direction matches RTL reading order */}
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
            {/* Header: "סיכום יומי" RIGHT, date LEFT (RTL) */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant">
              <span className="text-xs font-mono text-on-surface-variant">
                {format(activeDate, 'd.MM', { locale: he })}
              </span>
              <span className="text-sm font-bold text-on-surface">סיכום יומי</span>
            </div>

            {totalCount > 0 ? (
              <div className="p-4">
                {/* Content: donut LEFT, stats grid RIGHT — in RTL flex-row donut is on the left visually */}
                <div className="flex flex-row items-center gap-4">
                  {/* Donut chart — LEFT side */}
                  <div className="relative shrink-0 w-[110px] h-[110px]">
                    <PieChart width={110} height={110}>
                      <Pie
                        data={donutData}
                        cx={50}
                        cy={50}
                        innerRadius={32}
                        outerRadius={50}
                        dataKey="count"
                        strokeWidth={1}
                        stroke="#131313"
                        startAngle={90}
                        endAngle={-270}
                      >
                        {donutData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                    {/* Center label */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-lg font-bold text-on-surface leading-none">{totalCount}</span>
                      <span className="text-[9px] text-on-surface-variant font-mono">כוח</span>
                    </div>
                  </div>

                  {/* Stats 2×2 grid — RIGHT side (flex-1) */}
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    {summaryGroups.map(g => (
                      <div key={g.label} className="bg-surface-high rounded-md px-3 py-2 text-right">
                        <div
                          className="text-2xl font-bold leading-none mb-0.5"
                          style={{ color: g.count > 0 ? g.color : '#47483c' }}
                        >
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
                <button
                  onClick={() => navigate(`/diary/${activeDateKey}`)}
                  className="mt-2 text-xs text-primary underline"
                >
                  פתח פירוט
                </button>
              </div>
            )}
          </div>

          {/* ─── Personnel preview ─── */}
          {previewSoldiers.length > 0 && (
            <div className="mx-4 mb-4">
              {/* Section header: "מצב כוח אדם" RIGHT, "הכל (N) ←" LEFT (RTL layout) */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-primary font-bold">
                  {activeDateStatuses.filter(e => e.code).length > 6 && (
                    <button
                      onClick={() => navigate(`/diary/${activeDateKey}`)}
                    >
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
                      {/* Avatar — rightmost in RTL (flex-row-reverse) */}
                      <div className="shrink-0 w-9 h-9 rounded-full bg-primary-container flex items-center justify-center text-xs font-bold text-on-primary-container">
                        {initials}
                      </div>
                      {/* Name / rank — center */}
                      <div className="flex-1 text-right min-w-0">
                        <div className="text-sm font-bold text-on-surface truncate">{soldier.name}</div>
                        {(soldier.rank || soldier.unit) && (
                          <div className="text-[10px] font-mono text-on-surface-variant">
                            {[soldier.rank, soldier.unit].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                      {/* Badge + chevron — leftmost in RTL */}
                      <StatusBadge code={entry.code} size="sm" />
                      <span className="text-outline text-sm">›</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ─── Recent changes placeholder ─── */}
          <div className="mx-4 mb-4 p-4 bg-surface-high rounded-md border border-outline-variant text-right">
            <h2 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">שינויים אחרונים</h2>
            <p className="text-xs text-outline font-mono">אין שינויים אחרונים</p>
          </div>

        </div>
      )}

      {/* FAB — fixed above bottom nav */}
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
