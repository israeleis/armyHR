import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { getSheetValues } from '@/data/sheetsClient'
import { saveSnapshot, getSnapshot } from '@/data/localCache'
import { parseSheet } from '@/domain/sheetParser'
import { getSelectedSheet } from '@/features/sheet-picker/SheetPickerScreen'
import type { ParseResult } from '@/domain/types'

async function fetchAndCacheSheet(token: string | null, spreadsheetId: string, tabName: string): Promise<ParseResult> {
  let rawValues: string[][]
  try {
    if (!token) throw new Error('no token')
    rawValues = await getSheetValues(token, spreadsheetId, tabName)
    await saveSnapshot(spreadsheetId, tabName, rawValues)
  } catch (err) {
    if (String(err).includes('401')) throw err
    const snap = await getSnapshot(spreadsheetId, tabName)
    if (!snap) throw new Error('אין נתונים שמורים ואין גישה לרשת')
    rawValues = snap.rawValues
  }
  return parseSheet(rawValues)
}

export function useDiaryData() {
  const { token, clearToken } = useAuth()
  const sheet = getSelectedSheet()

  const query = useQuery({
    queryKey: ['diary', sheet?.id, sheet?.tabName, token],
    queryFn: () => fetchAndCacheSheet(token, sheet!.id, sheet!.tabName),
    enabled: !!sheet,
    staleTime: 1000 * 60 * 5,
    retry: false,
  })

  // Token rejected by server → clear token but keep email so silent refresh
  // can be attempted on the next app load.
  useEffect(() => {
    if (query.error && String(query.error).includes('401')) {
      clearToken()
    }
  }, [query.error, clearToken])

  return query
}
