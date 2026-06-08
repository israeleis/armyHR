/** Convert 0-indexed row/col to A1 notation, e.g. row=0,col=0 → "A1" */
export function toA1(row: number, col: number): string {
  let colStr = ''
  let c = col
  while (true) {
    colStr = String.fromCharCode(65 + (c % 26)) + colStr
    if (c < 26) break
    c = Math.floor(c / 26) - 1
  }
  return `${colStr}${row + 1}`
}

/** Range for a whole sheet tab */
export function sheetRange(sheetName: string): string {
  return encodeURIComponent(sheetName)
}

export interface SheetFile {
  id: string
  name: string
}

/** List all Google Sheets in the user's Drive (Drive API v3) */
export async function listUserSheets(token: string): Promise<SheetFile[]> {
  const res = await fetch(
    'https://www.googleapis.com/drive/v3/files?q=mimeType%3D%22application%2Fvnd.google-apps.spreadsheet%22&fields=files(id%2Cname)&orderBy=modifiedTime+desc&pageSize=50',
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error(`Drive API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return (data.files ?? []) as SheetFile[]
}

/** Fetch all values from a sheet tab (Sheets API v4) */
export async function getSheetValues(
  token: string,
  spreadsheetId: string,
  sheetName: string,
): Promise<string[][]> {
  const range = sheetRange(sheetName)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return (data.values ?? []) as string[][]
}

/** Get the list of tabs in a spreadsheet */
export async function getSheetTabs(
  token: string,
  spreadsheetId: string,
): Promise<string[]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return (data.sheets ?? []).map((s: any) => s.properties.title as string)
}

export interface CellUpdate {
  spreadsheetId: string
  sheetName: string
  row: number    // 0-indexed
  col: number    // 0-indexed
  value: string
}

/** Write a single cell value (Sheets API v4 batchUpdate values) */
export async function updateCell(token: string, update: CellUpdate): Promise<void> {
  const a1 = toA1(update.row, update.col)
  const range = `${update.sheetName}!${a1}`
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${update.spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ range, majorDimension: 'ROWS', values: [[update.value]] }),
  })
  if (!res.ok) throw new Error(`Sheets API update ${res.status}: ${await res.text()}`)
}

/** Read a single cell to detect conflicts */
export async function readCell(
  token: string,
  spreadsheetId: string,
  sheetName: string,
  row: number,
  col: number,
): Promise<string> {
  const a1 = toA1(row, col)
  const range = `${sheetName}!${a1}`
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Sheets API read ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return ((data.values ?? [['']])[0]?.[0] ?? '') as string
}
