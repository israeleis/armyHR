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

/** Safely quote a sheet tab name for use in A1 range notation.
 *  Google Sheets requires single-quoting when the name contains
 *  non-ASCII characters (Hebrew), spaces, or other special chars.
 *  Single quotes inside the name itself are escaped by doubling them. */
export function quotedSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`
}

/** Full URL-encoded range for a whole sheet tab */
export function sheetRange(sheetName: string): string {
  return encodeURIComponent(quotedSheetName(sheetName))
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

/** Look up the numeric sheetId for a given tab name */
async function getSheetIdByName(
  token: string,
  spreadsheetId: string,
  sheetName: string,
): Promise<number> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const sheet = (data.sheets ?? []).find((s: any) => s.properties.title === sheetName)
  if (!sheet) throw new Error(`Sheet tab "${sheetName}" not found`)
  return sheet.properties.sheetId as number
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
  const range = `${quotedSheetName(update.sheetName)}!${a1}`
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
  const range = `${quotedSheetName(sheetName)}!${a1}`
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Sheets API read ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return ((data.values ?? [['']])[0]?.[0] ?? '') as string
}

/** Write a cell note via Sheets API batchUpdate — creates the triangle chip on the cell.
 *  Note text is plain string; include author/timestamp in the text for attribution. */
export async function setCellNote(
  token: string,
  spreadsheetId: string,
  sheetName: string,
  row: number,
  col: number,
  note: string,
): Promise<void> {
  const sheetId = await getSheetIdByName(token, spreadsheetId, sheetName)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        updateCells: {
          range: {
            sheetId,
            startRowIndex: row,
            endRowIndex: row + 1,
            startColumnIndex: col,
            endColumnIndex: col + 1,
          },
          rows: [{ values: [{ note }] }],
          fields: 'note',
        },
      }],
    }),
  })
  if (!res.ok) throw new Error(`Sheets batchUpdate (note) ${res.status}: ${await res.text()}`)
}

// ── Sheet Picker: folder browse + search + paste ──────────────────────────

export interface FolderItem { id: string; name: string }

export interface FolderContents {
  folders: FolderItem[]
  sheets: SheetFile[]
  nextPageToken?: string
}

export interface SearchResults {
  sheets: SheetFile[]
}

/** Extract spreadsheet ID from a Google Sheets URL. Returns null if not a Sheets URL. */
export function extractSpreadsheetId(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  return m?.[1] ?? null
}

/** List folders and sheets inside a Drive folder (use 'root' for My Drive). */
export async function listFolderContents(
  token: string,
  folderId: string,
  pageToken?: string,
): Promise<FolderContents> {
  const safeFolderId = folderId.replace(/'/g, '')
  const q = `'${safeFolderId}' in parents AND (mimeType='application/vnd.google-apps.folder' OR mimeType='application/vnd.google-apps.spreadsheet') AND trashed=false`
  const params = new URLSearchParams({
    q,
    fields: 'nextPageToken,files(id,name,mimeType)',
    orderBy: 'folder,name',
    pageSize: '50',
  })
  if (pageToken) params.set('pageToken', pageToken)
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Drive API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const files: Array<{ id: string; name: string; mimeType: string }> = data.files ?? []
  const FOLDER_TYPE = 'application/vnd.google-apps.folder'
  return {
    folders: files.filter(f => f.mimeType === FOLDER_TYPE).map(f => ({ id: f.id, name: f.name })),
    sheets: files.filter(f => f.mimeType !== FOLDER_TYPE).map(f => ({ id: f.id, name: f.name })),
    nextPageToken: data.nextPageToken,
  }
}

/** Search Google Drive for spreadsheets by name. */
export async function searchSheets(
  token: string,
  query: string,
  pageToken?: string,
): Promise<SearchResults> {
  const safe = query.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const q = `name contains '${safe}' AND mimeType='application/vnd.google-apps.spreadsheet' AND trashed=false`
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name)',
    orderBy: 'modifiedTime desc',
    pageSize: '30',
  })
  if (pageToken) params.set('pageToken', pageToken)
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Drive API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return { sheets: (data.files ?? []) as SheetFile[] }
}

/** Fetch the display title of a spreadsheet by its ID. */
export async function getSpreadsheetTitle(token: string, spreadsheetId: string): Promise<string> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const title: string | undefined = data?.properties?.title
  if (!title) throw new Error(`Sheets API returned no title for ${spreadsheetId}`)
  return title
}

/** Check if the current user has edit permission on a spreadsheet.
 *  Uses `role` instead of `capabilities.canEdit` — the latter is unreliable
 *  with a drive.readonly token even when the user is an owner/writer. */
export async function canEditSpreadsheet(token: string, spreadsheetId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?fields=role`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) return true  // default to writable on API error
    const data = await res.json()
    const role: string = data?.role ?? ''
    return ['owner', 'organizer', 'fileOrganizer', 'writer'].includes(role)
  } catch {
    return true  // default to writable if check fails
  }
}

/** Create a sheet tab if it doesn't already exist. No-ops if already present. */
export async function ensureTabExists(
  token: string,
  spreadsheetId: string,
  tabName: string,
): Promise<void> {
  const tabs = await getSheetTabs(token, spreadsheetId)
  if (tabs.includes(tabName)) return
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tabName } } }] }),
  })
  if (!res.ok) {
    const text = await res.text()
    if (!text.includes('already exists')) throw new Error(`Sheets batchUpdate ${res.status}: ${text}`)
  }
}

/** Append a single row of values to a sheet tab. */
export async function appendRow(
  token: string,
  spreadsheetId: string,
  tabName: string,
  values: string[],
): Promise<void> {
  const range = sheetRange(tabName)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ majorDimension: 'ROWS', values: [values] }),
  })
  if (!res.ok) throw new Error(`Sheets append ${res.status}: ${await res.text()}`)
}
