# Sheet Picker Search, Browse & Paste Link — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Drive-wide search, folder hierarchy navigation, and direct URL paste to the sheet picker screen.

**Architecture:** `SheetPickerScreen` manages a `mode` state (`recent` | `search` | `browse` | `paste`). New Drive API functions are added to `sheetsClient.ts`. React Query handles first-page fetches; folder pagination accumulates in local state.

**Tech Stack:** React 19, React Query v5, Google Drive API v3, Google Sheets API v4, Vitest + jsdom

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/data/sheetsClient.ts` | Add `FolderItem`, `FolderContents`, `SearchResults` types; add `listFolderContents`, `searchSheets`, `getSpreadsheetTitle`, `extractSpreadsheetId` |
| Create | `src/data/__tests__/sheetsClient.test.ts` | Unit tests for `extractSpreadsheetId` and fetch-based functions |
| Modify | `src/features/sheet-picker/SheetPickerScreen.tsx` | Add search bar, mode state, browse folder navigation, paste link UI |

---

### Task 1: New API types, utility, and functions in `sheetsClient.ts`

**Files:**
- Modify: `src/data/sheetsClient.ts`
- Create: `src/data/__tests__/sheetsClient.test.ts`

- [ ] **Step 1: Write failing tests for `extractSpreadsheetId`**

Create `src/data/__tests__/sheetsClient.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  extractSpreadsheetId,
  listFolderContents,
  searchSheets,
  getSpreadsheetTitle,
} from '../sheetsClient'

// ── extractSpreadsheetId ─────────────────────────────────

describe('extractSpreadsheetId', () => {
  it('extracts ID from standard edit URL', () => {
    expect(
      extractSpreadsheetId('https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit#gid=0')
    ).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms')
  })

  it('extracts ID from view URL', () => {
    expect(extractSpreadsheetId('https://docs.google.com/spreadsheets/d/ABC123/view')).toBe('ABC123')
  })

  it('handles IDs with dashes and underscores', () => {
    expect(extractSpreadsheetId('https://docs.google.com/spreadsheets/d/1Bxi-MV_s0/edit')).toBe('1Bxi-MV_s0')
  })

  it('returns null for a Google Doc URL', () => {
    expect(extractSpreadsheetId('https://docs.google.com/document/d/ABC123/edit')).toBeNull()
  })

  it('returns null for plain text', () => {
    expect(extractSpreadsheetId('not a url')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractSpreadsheetId('')).toBeNull()
  })
})

// ── listFolderContents ───────────────────────────────────

describe('listFolderContents', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('splits response into folders and sheets', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        files: [
          { id: 'f1', name: 'יחידות', mimeType: 'application/vnd.google-apps.folder' },
          { id: 's1', name: 'מצבת', mimeType: 'application/vnd.google-apps.spreadsheet' },
        ],
      }),
    } as Response)

    const result = await listFolderContents('tok', 'root')
    expect(result.folders).toEqual([{ id: 'f1', name: 'יחידות' }])
    expect(result.sheets).toEqual([{ id: 's1', name: 'מצבת' }])
    expect(result.nextPageToken).toBeUndefined()
  })

  it('includes nextPageToken when present', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ files: [], nextPageToken: 'tok123' }),
    } as Response)

    const result = await listFolderContents('tok', 'root')
    expect(result.nextPageToken).toBe('tok123')
  })

  it('throws on non-ok response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    } as Response)

    await expect(listFolderContents('tok', 'root')).rejects.toThrow('Drive API 403')
  })
})

// ── searchSheets ─────────────────────────────────────────

describe('searchSheets', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns matching sheets', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ files: [{ id: 's1', name: 'מצבת 2026' }] }),
    } as Response)

    const result = await searchSheets('tok', 'מצבת')
    expect(result.sheets).toEqual([{ id: 's1', name: 'מצבת 2026' }])
  })

  it('escapes single quotes in query', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ files: [] }),
    } as Response)

    await searchSheets('tok', "O'Reilly")
    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toContain("O\\'Reilly")
  })
})

// ── getSpreadsheetTitle ──────────────────────────────────

describe('getSpreadsheetTitle', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns the spreadsheet title', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ properties: { title: 'My Sheet' } }),
    } as Response)

    const title = await getSpreadsheetTitle('tok', 'spreadsheet-id')
    expect(title).toBe('My Sheet')
  })

  it('throws on non-ok response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    } as Response)

    await expect(getSpreadsheetTitle('tok', 'bad-id')).rejects.toThrow('Sheets API 404')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/data/__tests__/sheetsClient.test.ts
```

Expected: FAIL — "Cannot find module" or function not found errors.

- [ ] **Step 3: Add types, `extractSpreadsheetId`, and the three async functions to `sheetsClient.ts`**

Append to the END of `src/data/sheetsClient.ts` (after the existing `readCell` function):

```ts
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
  const q = `'${folderId}' in parents AND (mimeType='application/vnd.google-apps.folder' OR mimeType='application/vnd.google-apps.spreadsheet') AND trashed=false`
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
  return data.properties.title as string
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/data/__tests__/sheetsClient.test.ts
```

Expected: PASS (all tests green — ~11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/sheetsClient.ts src/data/__tests__/sheetsClient.test.ts
git commit -m "feat(sheets): add listFolderContents, searchSheets, getSpreadsheetTitle, extractSpreadsheetId"
```

---

### Task 2: Search mode in `SheetPickerScreen`

**Files:**
- Modify: `src/features/sheet-picker/SheetPickerScreen.tsx`

This task adds: search input bar (always visible), 400ms debounce, React Query for search results, mode switching between `recent` and `search`.

- [ ] **Step 1: Replace the full content of `SheetPickerScreen.tsx`**

Replace the entire file with:

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import {
  listUserSheets,
  searchSheets,
  type SheetFile,
  type FolderItem,
} from '@/data/sheetsClient'
import { useSheetHistory } from '@/hooks/useSheetHistory'

const SELECTED_SHEET_KEY = 'army-hr-sheet'

export function getSelectedSheet(): { id: string; name: string } | null {
  try {
    const raw = localStorage.getItem(SELECTED_SHEET_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setSelectedSheet(sheet: { id: string; name: string }) {
  localStorage.setItem(SELECTED_SHEET_KEY, JSON.stringify(sheet))
}

type Mode = 'recent' | 'search' | 'browse' | 'paste'

function SheetRow({ sheet, onSelect }: { sheet: SheetFile; onSelect: (s: SheetFile) => void }) {
  return (
    <button
      onClick={() => onSelect(sheet)}
      className="w-full text-right bg-surface-high border border-outline-variant rounded-md px-4 py-3
        hover:border-primary hover:bg-primary-container/20 active:bg-primary-container/40
        transition-colors flex items-center gap-3"
    >
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current text-primary shrink-0" aria-hidden="true">
        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/>
      </svg>
      <span className="flex-1 font-medium text-on-surface truncate">{sheet.name}</span>
      <span className="text-xs font-mono text-on-surface-variant shrink-0">{sheet.id.slice(-8)}</span>
    </button>
  )
}

export function SheetPickerScreen() {
  const { token, isSignedIn } = useAuth()
  const navigate = useNavigate()
  const { addSheet } = useSheetHistory()

  const [mode, setMode] = useState<Mode>('recent')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [folderStack, setFolderStack] = useState<FolderItem[]>([])

  useEffect(() => {
    if (!isSignedIn) navigate('/signin', { replace: true })
  }, [isSignedIn, navigate])

  // 400ms debounce for search
  useEffect(() => {
    if (!searchQuery) {
      setDebouncedQuery('')
      setMode('recent')
      return
    }
    setMode('search')
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 400)
    return () => clearTimeout(t)
  }, [searchQuery])

  const { data: recentSheets, isLoading: recentLoading, error: recentError } = useQuery({
    queryKey: ['sheets', token],
    queryFn: () => listUserSheets(token!),
    enabled: !!token,
    staleTime: 1000 * 60 * 5,
  })

  const {
    data: searchResults,
    isLoading: searchLoading,
    error: searchError,
  } = useQuery({
    queryKey: ['search-sheets', token, debouncedQuery],
    queryFn: () => searchSheets(token!, debouncedQuery),
    enabled: !!token && debouncedQuery.length > 0,
    staleTime: 0,
  })

  function selectSheet(sheet: SheetFile) {
    const entry = { id: sheet.id, name: sheet.name }
    localStorage.setItem(SELECTED_SHEET_KEY, JSON.stringify(entry))
    addSheet(entry)
    navigate('/diary', { replace: true })
  }

  const isSearchPending = searchQuery.length > 0 && debouncedQuery !== searchQuery

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-background" dir="rtl">
      {/* Header with search */}
      <header className="sticky top-0 z-10 bg-surface-container border-b border-outline-variant px-4 pt-3 pb-3">
        <h1 className="text-headline-sm font-bold text-primary mb-2">בחירת גיליון</h1>
        <div className="relative">
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="חפש גיליון..."
            dir="rtl"
            className="w-full bg-surface-high border border-outline-variant rounded-md pr-9 pl-3 py-2 text-sm
              text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
              aria-label="נקה חיפוש"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">

        {/* ── SEARCH MODE ── */}
        {mode === 'search' && (
          <>
            {(isSearchPending || searchLoading) && (
              <div className="text-center text-on-surface-variant py-8 font-mono text-sm">מחפש...</div>
            )}
            {searchError && (
              <div className="bg-error-container/30 border border-error/50 rounded-md p-3 text-error text-sm text-right">
                שגיאה בחיפוש: {String(searchError)}
              </div>
            )}
            {!isSearchPending && !searchLoading && searchResults?.sheets.length === 0 && (
              <div className="text-center text-on-surface-variant py-12 text-sm">
                לא נמצאו גיליונות עבור ״{debouncedQuery}״
              </div>
            )}
            {!isSearchPending && searchResults?.sheets.map(sheet => (
              <SheetRow key={sheet.id} sheet={sheet} onSelect={selectSheet} />
            ))}
          </>
        )}

        {/* ── RECENT MODE ── */}
        {mode === 'recent' && (
          <>
            {recentLoading && (
              <div className="text-center text-on-surface-variant py-12 font-mono text-sm">
                טוען גיליונות...
              </div>
            )}
            {recentError && (
              <div className="bg-error-container/30 border border-error/50 rounded-md p-4 text-error text-sm">
                שגיאה בטעינת גיליונות: {String(recentError)}
              </div>
            )}
            {recentSheets?.map(sheet => (
              <SheetRow key={sheet.id} sheet={sheet} onSelect={selectSheet} />
            ))}
            {recentSheets?.length === 0 && (
              <div className="text-center text-on-surface-variant py-12 text-sm">
                לא נמצאו גיליונות ב-Google Drive שלך
              </div>
            )}
            {/* Footer action buttons — browse & paste */}
            {!recentLoading && (
              <div className="pt-4 border-t border-outline-variant space-y-1 text-right">
                <p className="text-xs text-on-surface-variant mb-3">אפשרויות נוספות</p>
                {/* Browse button — placeholder for Task 3 */}
                <button
                  onClick={() => { setMode('browse'); setFolderStack([]) }}
                  className="w-full text-right text-sm font-bold text-primary py-3 flex items-center gap-2"
                >
                  <span>📁</span> עיין בתיקיות Drive
                </button>
                {/* Paste button — placeholder for Task 4 */}
                <button
                  onClick={() => setMode('paste')}
                  className="w-full text-right text-sm font-bold text-primary py-3 flex items-center gap-2"
                >
                  <span>🔗</span> הדבק קישור לגיליון
                </button>
              </div>
            )}
          </>
        )}

        {/* ── BROWSE MODE placeholder ── (implemented in Task 3) */}
        {mode === 'browse' && (
          <div className="text-center text-on-surface-variant py-12 text-sm">
            מצב עיון — יושם בשלב הבא
          </div>
        )}

        {/* ── PASTE MODE placeholder ── (implemented in Task 4) */}
        {mode === 'paste' && (
          <div className="text-center text-on-surface-variant py-12 text-sm">
            מצב הדבקת קישור — יושם בשלב הבא
          </div>
        )}

      </div>

      {getSelectedSheet() && (
        <div className="p-4 border-t border-outline-variant text-xs text-on-surface-variant text-center">
          גיליון נוכחי: <span className="font-mono text-primary">{getSelectedSheet()?.name}</span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc -b --noEmit
```

Expected: no new errors (pre-existing unused-variable warnings are OK).

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/features/sheet-picker/SheetPickerScreen.tsx
git commit -m "feat(sheet-picker): add search bar and search mode"
```

---

### Task 3: Folder browse mode

**Files:**
- Modify: `src/features/sheet-picker/SheetPickerScreen.tsx`

This task fills in the `browse` mode: breadcrumb navigation, folder + sheet list, load more.

- [ ] **Step 1: Add browse-related imports and state to `SheetPickerScreen.tsx`**

At the top of the file, extend imports from sheetsClient:

```tsx
import {
  listUserSheets,
  searchSheets,
  listFolderContents,        // ADD
  type SheetFile,
  type FolderItem,
  type FolderContents,       // ADD
} from '@/data/sheetsClient'
```

Inside `SheetPickerScreen`, after the `folderStack` state declaration, add:

```tsx
// Browse: pagination extras (first page is from React Query; extras accumulate on "load more")
const [extraFolders, setExtraFolders] = useState<FolderItem[]>([])
const [extraSheets, setExtraSheets] = useState<SheetFile[]>([])
const [loadMoreToken, setLoadMoreToken] = useState<string | undefined>()
const [loadingMore, setLoadingMore] = useState(false)
```

- [ ] **Step 2: Add folder React Query and reset effect**

After the `searchResults` useQuery block, add:

```tsx
const currentFolderId = folderStack.at(-1)?.id ?? 'root'

const {
  data: folderData,
  isLoading: folderLoading,
  error: folderError,
  refetch: retryFolder,
} = useQuery<FolderContents>({
  queryKey: ['folder', token, currentFolderId],
  queryFn: () => listFolderContents(token!, currentFolderId),
  enabled: mode === 'browse' && !!token,
  staleTime: 1000 * 60 * 2,
})

// Reset pagination extras whenever the first page changes (new folder entered)
useEffect(() => {
  setExtraFolders([])
  setExtraSheets([])
  setLoadMoreToken(folderData?.nextPageToken)
}, [folderData])

const displayFolders = [...(folderData?.folders ?? []), ...extraFolders]
const displaySheets = [...(folderData?.sheets ?? []), ...extraSheets]

async function handleLoadMore() {
  if (!loadMoreToken || !token) return
  setLoadingMore(true)
  try {
    const more = await listFolderContents(token, currentFolderId, loadMoreToken)
    setExtraFolders(prev => [...prev, ...more.folders])
    setExtraSheets(prev => [...prev, ...more.sheets])
    setLoadMoreToken(more.nextPageToken)
  } catch {
    // error is non-critical; user can retry by pressing "load more" again
  } finally {
    setLoadingMore(false)
  }
}

function enterFolder(folder: FolderItem) {
  setFolderStack(prev => [...prev, folder])
}

function browseBack() {
  if (folderStack.length === 0) {
    setMode('recent')
    return
  }
  setFolderStack(prev => prev.slice(0, -1))
}
```

- [ ] **Step 3: Replace the browse mode placeholder with the full browse UI**

Find in the JSX:

```tsx
{/* ── BROWSE MODE placeholder ── (implemented in Task 3) */}
{mode === 'browse' && (
  <div className="text-center text-on-surface-variant py-12 text-sm">
    מצב עיון — יושם בשלב הבא
  </div>
)}
```

Replace with:

```tsx
{/* ── BROWSE MODE ── */}
{mode === 'browse' && (
  <>
    {/* Breadcrumb */}
    <div className="sticky top-0 z-10 bg-surface-container border-b border-outline-variant px-4 py-2 flex items-center gap-1 text-sm flex-wrap" dir="rtl">
      <button
        onClick={browseBack}
        className="text-primary font-bold pl-2"
        aria-label="חזור"
      >
        ←
      </button>
      <button
        onClick={() => setFolderStack([])}
        className={`text-on-surface-variant hover:text-on-surface ${folderStack.length === 0 ? 'text-on-surface font-bold' : ''}`}
      >
        My Drive
      </button>
      {folderStack.map((folder, i) => (
        <span key={folder.id} className="flex items-center gap-1">
          <span className="text-outline-variant">›</span>
          <button
            onClick={() => setFolderStack(folderStack.slice(0, i + 1))}
            className={`truncate max-w-[120px] hover:text-on-surface ${i === folderStack.length - 1 ? 'text-on-surface font-bold' : 'text-on-surface-variant'}`}
          >
            {folder.name}
          </button>
        </span>
      ))}
    </div>

    {/* Loading state */}
    {folderLoading && (
      <div className="text-center text-on-surface-variant py-8 font-mono text-sm">טוען...</div>
    )}

    {/* Error state */}
    {folderError && (
      <div className="bg-error-container/30 border border-error/50 rounded-md p-3 text-error text-sm text-right flex items-center justify-between">
        <span>שגיאה בטעינת תיקייה</span>
        <button onClick={() => retryFolder()} className="text-xs underline">נסה שוב</button>
      </div>
    )}

    {/* Empty state */}
    {!folderLoading && !folderError && displayFolders.length === 0 && displaySheets.length === 0 && (
      <div className="text-center text-on-surface-variant py-12 text-sm">תיקייה ריקה</div>
    )}

    {/* Folders */}
    {displayFolders.map(folder => (
      <button
        key={folder.id}
        onClick={() => enterFolder(folder)}
        className="w-full text-right bg-surface-high border border-outline-variant rounded-md px-4 py-3
          hover:border-primary hover:bg-primary-container/20 transition-colors flex items-center gap-3"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current text-on-surface-variant shrink-0" aria-hidden="true">
          <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
        </svg>
        <span className="flex-1 font-medium text-on-surface truncate">{folder.name}</span>
        <span className="text-on-surface-variant text-sm">›</span>
      </button>
    ))}

    {/* Sheets */}
    {displaySheets.map(sheet => (
      <SheetRow key={sheet.id} sheet={sheet} onSelect={selectSheet} />
    ))}

    {/* Load more */}
    {loadMoreToken && (
      <button
        onClick={handleLoadMore}
        disabled={loadingMore}
        className="w-full py-3 text-sm text-primary font-bold text-center border border-outline-variant rounded-md hover:bg-surface-high transition-colors disabled:opacity-50"
      >
        {loadingMore ? 'טוען...' : 'טען עוד'}
      </button>
    )}
  </>
)}
```

- [ ] **Step 4: Type-check and test**

```bash
npx tsc -b --noEmit && npx vitest run
```

Expected: no TS errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/sheet-picker/SheetPickerScreen.tsx
git commit -m "feat(sheet-picker): add folder browse mode with breadcrumb and load more"
```

---

### Task 4: Paste link mode

**Files:**
- Modify: `src/features/sheet-picker/SheetPickerScreen.tsx`

This task fills in the `paste` mode: URL input, ID extraction, title fetch, error states.

- [ ] **Step 1: Add paste-related imports and state**

Add `getSpreadsheetTitle` and `extractSpreadsheetId` to the sheetsClient import:

```tsx
import {
  listUserSheets,
  searchSheets,
  listFolderContents,
  getSpreadsheetTitle,       // ADD
  extractSpreadsheetId,      // ADD
  type SheetFile,
  type FolderItem,
  type FolderContents,
} from '@/data/sheetsClient'
```

Inside `SheetPickerScreen`, after the `loadingMore` state, add:

```tsx
const [pasteValue, setPasteValue] = useState('')
const [pasteError, setPasteError] = useState<string | null>(null)
const [pasteLoading, setPasteLoading] = useState(false)
```

- [ ] **Step 2: Add `handlePasteConfirm` function**

Inside `SheetPickerScreen`, after `browseBack`, add:

```tsx
async function handlePasteConfirm() {
  const id = extractSpreadsheetId(pasteValue.trim())
  if (!id) {
    setPasteError('קישור לא תקין — יש להדביק קישור לגיליון Google Sheets')
    return
  }
  if (!token) return
  setPasteError(null)
  setPasteLoading(true)
  try {
    const title = await getSpreadsheetTitle(token, id)
    selectSheet({ id, name: title })
  } catch {
    setPasteError('לא ניתן לגשת לגיליון — בדוק שיש לך הרשאות גישה')
  } finally {
    setPasteLoading(false)
  }
}
```

- [ ] **Step 3: Replace the paste mode placeholder with the full paste UI**

Find:

```tsx
{/* ── PASTE MODE placeholder ── (implemented in Task 4) */}
{mode === 'paste' && (
  <div className="text-center text-on-surface-variant py-12 text-sm">
    מצב הדבקת קישור — יושם בשלב הבא
  </div>
)}
```

Replace with:

```tsx
{/* ── PASTE MODE ── */}
{mode === 'paste' && (
  <div className="bg-surface-high border border-outline-variant rounded-lg p-4 space-y-3">
    <p className="text-sm font-bold text-on-surface text-right">הדבק קישור Google Sheets</p>
    <input
      type="url"
      value={pasteValue}
      onChange={e => { setPasteValue(e.target.value); setPasteError(null) }}
      placeholder="https://docs.google.com/spreadsheets/d/..."
      dir="ltr"
      className="w-full bg-surface-container border border-outline-variant rounded-md px-3 py-2 text-sm
        text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
      autoFocus
    />
    {pasteError && (
      <p className="text-xs text-error text-right">{pasteError}</p>
    )}
    <div className="flex gap-2 justify-start">
      <button
        onClick={handlePasteConfirm}
        disabled={pasteLoading || !pasteValue.trim()}
        className="text-sm font-bold bg-primary-container text-on-primary-container rounded-md px-4 py-2 hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {pasteLoading ? '...' : 'אישור ←'}
      </button>
      <button
        onClick={() => { setMode('recent'); setPasteValue(''); setPasteError(null) }}
        className="text-sm font-bold text-on-surface-variant border border-outline-variant rounded-md px-4 py-2 hover:bg-surface-container transition-colors"
      >
        ביטול
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 4: Type-check and run all tests**

```bash
npx tsc -b --noEmit && npx vitest run
```

Expected: no TS errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/sheet-picker/SheetPickerScreen.tsx
git commit -m "feat(sheet-picker): add paste link mode with URL extraction and title fetch"
```

---

### Task 5: Manual smoke test

- [ ] **Step 1: Verify dev server is running at http://localhost:5174**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5174/
```

Expected: `200`

- [ ] **Step 2: Verify checklist** (open http://localhost:5174/#/sheets in a browser)

- [ ] Search bar visible immediately on the sheet picker screen
- [ ] Typing in the search bar after 400ms triggers a Drive search (check network tab or loading spinner)
- [ ] Clearing the search bar returns to the recent list
- [ ] "עיין בתיקיות Drive" button appears below the recent list
- [ ] Tapping it shows "My Drive" breadcrumb and lists Drive root contents
- [ ] Tapping a folder enters it and updates the breadcrumb
- [ ] Breadcrumb segments are tappable to jump back up
- [ ] "← " back button at breadcrumb start exits browse mode or goes up
- [ ] "טען עוד" appears only when more pages exist
- [ ] "הדבד קישור לגיליון" button appears below the recent list
- [ ] Tapping it shows URL input with confirm/cancel
- [ ] Pasting a valid Sheets URL and confirming selects the sheet
- [ ] Pasting an invalid URL shows "קישור לא תקין" error
