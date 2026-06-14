// src/features/transitions/useTransitions.ts
import { useMemo } from 'react'
import { useDiaryData } from '@/features/diary/useDiaryData'
import { getStatus } from '@/domain/statuses'
import type { SoldierFields } from '@/domain/types'

export interface TransitionEntry {
  soldier: SoldierFields
  date: Date
  dateKey: string
  types: ('פתיחה' | 'סגירה')[]
  statusCode: string
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shiftDateKey(dk: string, days: number): string {
  const [y, m, d] = dk.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return toDateKey(dt)
}

export function useTransitions() {
  const { data, isLoading, error } = useDiaryData()

  const { transitions, dates } = useMemo(() => {
    if (!data) return { transitions: [] as TransitionEntry[], dates: [] as Date[] }

    const dates = Array.from(data.schema.dateColIndices.values())
      .sort((a, b) => a.getTime() - b.getTime())

    // Build index: soldierId → dateKey → statusCode
    const index = new Map<string, Map<string, string>>()
    for (const e of data.statuses) {
      if (!index.has(e.soldierId)) index.set(e.soldierId, new Map())
      index.get(e.soldierId)!.set(e.dateKey, e.code)
    }

    const entries: TransitionEntry[] = []

    for (const date of dates) {
      const dk = toDateKey(date)
      for (const soldier of data.soldiers) {
        const todayCode = index.get(soldier.id)?.get(dk)
        if (!todayCode || !getStatus(todayCode)?.isPaid) continue

        const types: ('פתיחה' | 'סגירה')[] = []

        const prevCode = index.get(soldier.id)?.get(shiftDateKey(dk, -1))
        if (!prevCode || !getStatus(prevCode)?.isPaid) types.push('פתיחה')

        const nextCode = index.get(soldier.id)?.get(shiftDateKey(dk, 1))
        if (!nextCode || !getStatus(nextCode)?.isPaid) types.push('סגירה')

        if (types.length === 0) continue

        entries.push({ soldier, date, dateKey: dk, types, statusCode: todayCode })
      }
    }

    return { transitions: entries, dates }
  }, [data])

  return { transitions, dates, isLoading, error }
}
