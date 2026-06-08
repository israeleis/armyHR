import { useState } from 'react'

export interface SheetEntry { id: string; name: string }

const HISTORY_KEY = 'army-hr-sheet-history'
const MAX_HISTORY = 20

function readHistory(): SheetEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
  } catch {
    return []
  }
}

function writeHistory(entries: SheetEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries))
}

export function useSheetHistory() {
  const [history, setHistory] = useState<SheetEntry[]>(readHistory)

  const addSheet = (sheet: SheetEntry) => {
    const next = [sheet, ...history.filter(s => s.id !== sheet.id)].slice(0, MAX_HISTORY)
    writeHistory(next)
    setHistory(next)
  }

  const removeSheet = (id: string) => {
    const next = history.filter(s => s.id !== id)
    writeHistory(next)
    setHistory(next)
  }

  const refresh = () => setHistory(readHistory())

  return { history, addSheet, removeSheet, refresh }
}
