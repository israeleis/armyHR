import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { getSheetValues, getSheetTabs } from '@/data/sheetsClient'
import { saveSnapshot, getSnapshot } from '@/data/localCache'
import { parseSheet } from '@/domain/sheetParser'
import { getSelectedSheet } from '@/features/sheet-picker/SheetPickerScreen'
import type { ParseResult } from '@/domain/types'

async function fetchAndCacheSheet(token: string, spreadsheetId: string): Promise<ParseResult> {
  // Get first tab name
  const tabs = await getSheetTabs(token, spreadsheetId)
  const sheetName = tabs[0] ?? 'Sheet1'

  let rawValues: string[][]
  try {
    rawValues = await getSheetValues(token, spreadsheetId, sheetName)
    await saveSnapshot(spreadsheetId, sheetName, rawValues)
  } catch {
    // Offline fallback: use cached snapshot
    const snap = await getSnapshot(spreadsheetId, sheetName)
    if (!snap) throw new Error('אין נתונים שמורים ואין גישה לרשת')
    rawValues = snap.rawValues
  }
  return parseSheet(rawValues)
}

export function useDiaryData() {
  const { token } = useAuth()
  const sheet = getSelectedSheet()

  return useQuery({
    queryKey: ['diary', sheet?.id, token],
    queryFn: () => fetchAndCacheSheet(token!, sheet!.id),
    enabled: !!token && !!sheet,
    staleTime: 1000 * 60 * 5,
    retry: false,  // we handle offline fallback ourselves
  })
}
