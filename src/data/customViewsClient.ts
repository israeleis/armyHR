import { getSheetValues, ensureTabExists, appendRow, updateCell } from './sheetsClient'
import { serializeFilterState, deserializeFilterState } from '@/features/filters'
import type { FilterState } from '@/features/filters'

const TAB = '_app_custom_views'
const HEADER = ['name', 'view', 'sheet_id', 'tab_name', 'filter_json', 'active', 'created_by', 'created_at']

export interface SavedView {
  rowIndex: number   // 1-indexed sheet row (for updates)
  name: string
  view: string       // route path e.g. '/trends'
  sheetId: string
  tabName: string
  filterState: FilterState
  active: boolean
  createdBy: string
  createdAt: string
}

/** Load all views for a spreadsheet (all tabs, all activity states). */
export async function loadSavedViews(token: string, spreadsheetId: string): Promise<SavedView[]> {
  let rows: string[][]
  try {
    rows = await getSheetValues(token, spreadsheetId, TAB)
  } catch {
    return []
  }
  return rows
    .slice(1) // skip header
    .map((row, i): SavedView | null => {
      const [name, view, sheetId, tabName, filterJson, active, createdBy, createdAt] = row
      if (!name || !view || !filterJson) return null
      try {
        return {
          rowIndex: i + 2,
          name, view,
          sheetId: sheetId ?? '',
          tabName: tabName ?? '',
          filterState: deserializeFilterState(filterJson),
          active: active !== 'FALSE',
          createdBy: createdBy ?? '',
          createdAt: createdAt ?? '',
        }
      } catch {
        return null
      }
    })
    .filter((v): v is SavedView => v !== null)
}

/** Append a new saved view (creates tab + header if needed). */
export async function saveView(
  token: string,
  spreadsheetId: string,
  view: Omit<SavedView, 'rowIndex'>,
): Promise<void> {
  await ensureTabExists(token, spreadsheetId, TAB)
  let rows: string[][]
  try { rows = await getSheetValues(token, spreadsheetId, TAB) } catch { rows = [] }
  if (rows.length === 0) await appendRow(token, spreadsheetId, TAB, HEADER)
  await appendRow(token, spreadsheetId, TAB, [
    view.name,
    view.view,
    view.sheetId,
    view.tabName,
    serializeFilterState(view.filterState),
    'TRUE',
    view.createdBy,
    view.createdAt,
  ])
}

/** Mark a view as inactive (sets column F to FALSE). */
export async function deactivateView(token: string, spreadsheetId: string, rowIndex: number): Promise<void> {
  await updateCell(token, { spreadsheetId, sheetName: TAB, row: rowIndex - 1, col: 5, value: 'FALSE' })
}
