# Sheet Picker — Search, Folder Browse & Paste Link Design

**Date:** 2026-06-09
**Status:** Approved

---

## Overview

Enhance `SheetPickerScreen` with three ways to find a Google Sheets file beyond the existing flat recent list:
1. **Global search** — Drive-wide search by name, debounced API query
2. **Folder browser** — navigate the Drive folder hierarchy from My Drive root
3. **Paste link** — paste a Google Sheets URL directly to select by ID

The screen stays as a single route (`/sheets`); all three capabilities live within it via internal mode state.

---

## Architecture

### Modes

`SheetPickerScreen` manages a `mode` state:

| Mode | Trigger | Content |
|------|---------|---------|
| `recent` | default on open | Flat list of 50 most-recently-modified sheets |
| `search` | search input has text | Drive-wide search results |
| `browse` | tap "עיין בתיקיות" button | Folder contents (folders + sheets) |
| `paste` | tap "הדבק קישור" button | Inline URL input row |

Clearing the search input returns to `recent`. Back button in browse returns up the folder stack (or back to `recent` if at root).

### Component state

```ts
const [mode, setMode] = useState<'recent' | 'search' | 'browse' | 'paste'>('recent')
const [searchQuery, setSearchQuery] = useState('')
const [debouncedQuery, setDebouncedQuery] = useState('')   // 400ms debounce
const [folderStack, setFolderStack] = useState<FolderItem[]>([])  // [] = My Drive root
const [pasteValue, setPasteValue] = useState('')
const [pasteError, setPasteError] = useState<string | null>(null)
const [pasteLoading, setPasteLoading] = useState(false)
// Browse pagination
const [allFolders, setAllFolders] = useState<FolderItem[]>([])
const [allSheets, setAllSheets] = useState<SheetFile[]>([])
const [nextPageToken, setNextPageToken] = useState<string | undefined>()
```

---

## New API Functions (`src/data/sheetsClient.ts`)

### Types

```ts
export interface FolderItem { id: string; name: string }

export interface FolderContents {
  folders: FolderItem[]
  sheets: SheetFile[]
  nextPageToken?: string
}

export interface SearchResults {
  sheets: SheetFile[]
}
```

### `listFolderContents`

```ts
export async function listFolderContents(
  token: string,
  folderId: string,        // 'root' for My Drive root
  pageToken?: string,
): Promise<FolderContents>
```

Drive API v3 query:
```
q='folderId' in parents AND (mimeType='application/vnd.google-apps.folder' OR mimeType='application/vnd.google-apps.spreadsheet') AND trashed=false
fields=nextPageToken,files(id,name,mimeType)
orderBy=folder,name
pageSize=50
```

Splits response into `folders` (mimeType = folder) and `sheets` (mimeType = spreadsheet).

### `searchSheets`

```ts
export async function searchSheets(
  token: string,
  query: string,
  pageToken?: string,
): Promise<SearchResults>
```

Drive API v3 query:
```
q=name contains 'query' AND mimeType='application/vnd.google-apps.spreadsheet' AND trashed=false
fields=nextPageToken,files(id,name)
orderBy=modifiedTime desc
pageSize=30
```

### `getSpreadsheetTitle`

```ts
export async function getSpreadsheetTitle(
  token: string,
  spreadsheetId: string,
): Promise<string>
```

`GET /v4/spreadsheets/{spreadsheetId}?fields=properties.title`
Returns `data.properties.title`.

### `extractSpreadsheetId` (pure utility, no API)

```ts
export function extractSpreadsheetId(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  return m?.[1] ?? null
}
```

---

## React Query Keys & Caching

| Query | Key | staleTime | Enabled |
|-------|-----|-----------|---------|
| Recent sheets | `['sheets', token]` | 5 min | always |
| Folder contents | `['folder', token, folderId]` | 2 min | `mode === 'browse'` |
| Search results | `['search-sheets', token, debouncedQuery]` | 0 (fresh) | `debouncedQuery.length > 0` |

**Load more (folder browse):** Pagination is handled outside React Query — component state accumulates pages. Each "טען עוד" tap calls `listFolderContents(token, currentFolderId, nextPageToken)` and appends to `allFolders`/`allSheets`.

**Folder navigation reset:** Entering a new folder resets `allFolders`, `allSheets`, `nextPageToken` before loading.

---

## UI Layout

```
┌─────────────────────────────────┐
│  [←] בחירת גיליון               │  ← AppHeader (global, stays)
├─────────────────────────────────┤
│  🔍  חפש גיליון...              │  ← Search input (always visible)
├─────────────────────────────────┤
│  [browse mode only]             │
│  My Drive › תיקייה › עוד       │  ← Breadcrumb (tappable segments)
├─────────────────────────────────┤
│                                 │
│  [content area by mode]         │
│                                 │
│  recent:  flat sheet list       │
│  search:  search results        │
│  browse:  folders then sheets   │
│  paste:   URL input row         │
│                                 │
├─────────────────────────────────┤
│  📁 עיין בתיקיות                │  ← shown in recent mode only
│  🔗 הדבק קישור לגיליון         │  ← shown in recent mode only
└─────────────────────────────────┘
```

### Recent mode footer buttons

Below the recent list, two text buttons:
- `📁 עיין בתיקיות` — sets `mode = 'browse'`, loads root folder
- `🔗 הדבד קישור לגיליון` — sets `mode = 'paste'`, shows URL input

### Browse mode — breadcrumb

Row below search bar showing the path. Each folder segment is a tappable button that pops the stack back to that level. Leftmost (RTL start): `←` button pops one level (or exits to recent if at root).

Example (RTL, right-to-left reading): `← My Drive › יחידות › גדוד א`

### Browse mode — list

Folders first with `📁` icon, then sheets with `📊` icon. Each folder tap:
1. Pushes folder onto `folderStack`
2. Resets `allFolders`/`allSheets`/`nextPageToken`
3. Loads new folder contents

"טען עוד" button at bottom when `nextPageToken` is set.

### Search mode

Results appear as sheets list (same row style as recent). Loading spinner while debounce is pending or API is fetching. Empty state: `לא נמצאו גיליונות עבור ״{query}״`.

### Paste mode

Inline below search bar:
```
┌─────────────────────────────────────────┐
│  הדבק קישור Google Sheets:              │
│  [input: https://docs.google.com/...]   │
│  [ביטול]  [אישור ←]                   │
│  [error message if any]                 │
└─────────────────────────────────────────┘
```

On confirm:
1. `extractSpreadsheetId(pasteValue)` — if null → `setPasteError('קישור לא תקין')`
2. Call `getSpreadsheetTitle(token, id)` — loading spinner on confirm button
3. On success → `selectSheet({ id, name: title })` → navigate to `/diary`
4. On API error → `setPasteError('לא ניתן לגשת לגיליון — בדוק הרשאות')`

---

## Error Handling

| Scenario | UI response |
|----------|-------------|
| Folder load fails | Inline error banner with "נסה שוב" retry button, stays in browse mode |
| Search fails | "שגיאה בחיפוש" below search bar |
| Paste — invalid URL | "קישור לא תקין" below input |
| Paste — API error | "לא ניתן לגשת לגיליון" below input |
| Empty folder | "תיקייה ריקה" centered message |

---

## File Changes

| Action | File | Change |
|--------|------|--------|
| Modify | `src/data/sheetsClient.ts` | Add `FolderItem`, `FolderContents`, `SearchResults` types; `listFolderContents`, `searchSheets`, `getSpreadsheetTitle`, `extractSpreadsheetId` |
| Modify | `src/features/sheet-picker/SheetPickerScreen.tsx` | Add mode state, search input, breadcrumb, folder list, load more, paste input; replace simple list render with mode-driven render |
