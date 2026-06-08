import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import { useDiaryData } from '@/features/diary/useDiaryData'
import { StatusBadge } from '@/components/StatusBadge'

export function SoldierScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, isLoading } = useDiaryData()

  const soldier = useMemo(() =>
    data?.soldiers.find(s => s.id === decodeURIComponent(id ?? '')),
    [data, id]
  )

  const entries = useMemo(() =>
    data?.statuses
      .filter(e => e.soldierId === soldier?.id)
      .sort((a, b) => a.date.getTime() - b.date.getTime()) ?? [],
    [data, soldier]
  )

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="sticky top-0 z-10 bg-surface-container border-b border-outline-variant px-4 py-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-primary mb-1"
        >
          ‹ חזרה
        </button>
        <h1 className="text-headline-sm font-bold text-on-surface">
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
        <div className="m-4 text-on-surface-variant text-sm text-center py-8">
          חייל לא נמצא
        </div>
      )}

      {soldier && (
        <div className="flex-1 overflow-y-auto p-4">
          {/* Metadata card */}
          {(soldier.phone || Object.keys(soldier.extra).length > 0) && (
            <div className="bg-surface-high border border-outline-variant rounded-md p-4 mb-4">
              <h2 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">פרטים</h2>
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

          {/* Status history */}
          <h2 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">היסטוריית סטטוס</h2>
          <div className="space-y-1">
            {entries.map(entry => (
              <div
                key={entry.dateKey}
                className="flex items-center justify-between bg-surface-high border border-outline-variant rounded-md px-3 py-2"
              >
                <StatusBadge code={entry.code} size="sm" />
                <div className="text-right">
                  <div className="text-sm font-mono text-on-surface">
                    {format(entry.date, 'dd/MM/yyyy')}
                  </div>
                  <div className="text-xs text-on-surface-variant">
                    {format(entry.date, 'EEEE', { locale: he })}
                  </div>
                </div>
              </div>
            ))}
            {entries.length === 0 && (
              <p className="text-sm text-outline text-center py-6 font-mono">אין היסטוריה</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
