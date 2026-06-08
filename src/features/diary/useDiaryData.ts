import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { getSheetValues, getSheetTabs } from '@/data/sheetsClient'
import { saveSnapshot, getSnapshot } from '@/data/localCache'
import { parseSheet } from '@/domain/sheetParser'
import { getSelectedSheet } from '@/features/sheet-picker/SheetPickerScreen'
import type { ParseResult } from '@/domain/types'

async function fetchAndCacheSheet(token: string, spreadsheetId: string): Promise<ParseResult> {
  const tabs = await getSheetTabs(token, spreadsheetId)
  const sheetName = tabs.find(t => t === 'Doh1') ?? tabs[0] ?? 'Sheet1'

  let rawValues: string[][]
  try {
    rawValues = await getSheetValues(token, spreadsheetId, sheetName)
    await saveSnapshot(spreadsheetId, sheetName, rawValues)
  } catch (err) {
    // Auth errors must surface immediately — don't mask them with stale cache
    if (String(err).includes('401')) throw err
    // Offline fallback: use cached snapshot
    const snap = await getSnapshot(spreadsheetId, sheetName)
    if (!snap) throw new Error('אין נתונים שמורים ואין גישה לרשת')
    rawValues = snap.rawValues
  }
  return parseSheet(rawValues)
}

export function useDiaryData() {
  const { token, signOut } = useAuth()
  const sheet = getSelectedSheet()

  const query = useQuery({
    queryKey: ['diary', sheet?.id, token],
    queryFn: () => fetchAndCacheSheet(token!, sheet!.id),
    enabled: !!token && !!sheet,
    staleTime: 1000 * 60 * 5,
    retry: false,
  })

  // Token expired → clear session and redirect to sign-in
  useEffect(() => {
    if (query.error && String(query.error).includes('401')) {
      signOut()
    }
  }, [query.error, signOut])

  return query
}
