# Saved Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users save named filter configurations to `_app_custom_views` sheet tab, load them from a collapsible sidebar section, and apply them instantly.

**Architecture:** Filter state is serialized to JSON (Sets→arrays) and stored as a row in `_app_custom_views`. The sidebar fetches all active views for the current spreadsheet via React Query. Clicking a view navigates with `location.state.pendingFilter`; screens also accept `?filter=<base64>` URL param for shared links (read-only — app never writes to URL).

**Tech Stack:** React 18, React Router v6 (hash router), TanStack Query v5, Google Sheets API v4

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/features/filters/index.ts` | Modify | Add serialize/deserialize/encode/decode helpers |
| `src/data/sheetsClient.ts` | Modify | Add `ensureTabExists`, `appendRow` |
| `src/data/customViewsClient.ts` | Create | CRUD for `_app_custom_views` tab |
| `src/hooks/useSavedViews.ts` | Create | React Query hook: load, save, deactivate |
| `src/components/SaveViewDialog.tsx` | Create | Modal with name input |
| `src/components/FilterPane.tsx` | Modify | Add `onSaveRequest` prop + "שמור תצוגה" button |
| `src/components/Sidebar.tsx` | Modify | Add collapsible "תצוגות שמורות" section |
| `src/features/trends/TrendsScreen.tsx` | Modify | Apply pending filter on mount; wire save dialog |
| `src/features/daily/DailyDetailScreen.tsx` | Modify | Same as TrendsScreen |

---

## Task 1: Filter serialization helpers

**Files:**
- Modify: `src/features/filters/index.ts`

- [ ] **Add types and helpers at the end of `src/features/filters/index.ts`:**

```ts
// ── Serialization (Set ↔ string[] for JSON/sheet storage) ─────────────────

export interface SerializedFilterState {
  multiSelect: Record<string, string[]>
  text: Record<string, string>
}

export function serializeFilterState(state: FilterState): string {
  const s: SerializedFilterState = {
    multiSelect: Object.fromEntries(
      Object.entries(state.multiSelect).map(([k, v]) => [k, [...v]])
    ),
    text: { ...state.text },
  }
  return JSON.stringify(s)
}

export function deserializeFilterState(json: string): FilterState {
  const s = JSON.parse(json) as SerializedFilterState
  return {
    multiSelect: Object.fromEntries(
      Object.entries(s.multiSelect ?? {}).map(([k, v]) => [k, new Set(v)])
    ),
    text: s.text ?? {},
  }
}

// ── URL encoding (base64 JSON, for shared deep links) ────────────────────

export function encodeFilterState(state: FilterState): string {
  return btoa(unescape(encodeURIComponent(serializeFilterState(state))))
}

export function decodeFilterState(encoded: string): FilterState | null {
  try {
    return deserializeFilterState(decodeURIComponent(escape(atob(encoded))))
  } catch {
    return null
  }
}
```

- [ ] **Type-check:**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Commit:**

```bash
git add src/features/filters/index.ts
git commit -m "feat(filters): add serialize/deserialize and base64 URL encode helpers"
```

---

## Task 2: Sheets API helpers

**Files:**
- Modify: `src/data/sheetsClient.ts`

- [ ] **Append these two functions to the end of `src/data/sheetsClient.ts`:**

```ts
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
```

- [ ] **Type-check:**

```bash
npx tsc --noEmit
```

- [ ] **Commit:**

```bash
git add src/data/sheetsClient.ts
git commit -m "feat(sheets): add ensureTabExists and appendRow helpers"
```

---

## Task 3: `customViewsClient.ts`

**Files:**
- Create: `src/data/customViewsClient.ts`

- [ ] **Create `src/data/customViewsClient.ts`:**

```ts
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
```

- [ ] **Type-check:**

```bash
npx tsc --noEmit
```

- [ ] **Commit:**

```bash
git add src/data/customViewsClient.ts
git commit -m "feat(saved-views): add customViewsClient CRUD for _app_custom_views tab"
```

---

## Task 4: `useSavedViews` hook

**Files:**
- Create: `src/hooks/useSavedViews.ts`

- [ ] **Create `src/hooks/useSavedViews.ts`:**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { getSelectedSheet } from '@/features/sheet-picker/SheetPickerScreen'
import { loadSavedViews, saveView, deactivateView } from '@/data/customViewsClient'
import type { FilterState } from '@/features/filters'

export function useSavedViews() {
  const { token, userEmail } = useAuth()
  const sheet = getSelectedSheet()
  const queryClient = useQueryClient()
  const queryKey = ['saved-views', sheet?.id]

  const query = useQuery({
    queryKey,
    queryFn: () => loadSavedViews(token!, sheet!.id),
    enabled: !!token && !!sheet,
    staleTime: 1000 * 60,
  })

  const saveMutation = useMutation({
    mutationFn: ({ name, view, filterState }: { name: string; view: string; filterState: FilterState }) =>
      saveView(token!, sheet!.id, {
        name,
        view,
        sheetId: sheet!.id,
        tabName: sheet!.tabName,
        filterState,
        active: true,
        createdBy: userEmail ?? '',
        createdAt: new Date().toISOString(),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  const deactivateMutation = useMutation({
    mutationFn: (rowIndex: number) => deactivateView(token!, sheet!.id, rowIndex),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  return {
    views: query.data ?? [],
    isLoading: query.isLoading,
    saveView: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    deactivateView: deactivateMutation.mutate,
  }
}
```

- [ ] **Type-check:**

```bash
npx tsc --noEmit
```

- [ ] **Commit:**

```bash
git add src/hooks/useSavedViews.ts
git commit -m "feat(saved-views): add useSavedViews React Query hook"
```

---

## Task 5: `SaveViewDialog` component

**Files:**
- Create: `src/components/SaveViewDialog.tsx`

- [ ] **Create `src/components/SaveViewDialog.tsx`:**

```tsx
import { useState } from 'react'

interface SaveViewDialogProps {
  open: boolean
  onClose: () => void
  onSave: (name: string) => Promise<void>
}

export function SaveViewDialog({ open, onClose, onSave }: SaveViewDialogProps) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) return null

  async function handleSave() {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      await onSave(name.trim())
      setName('')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    setName('')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70" dir="rtl">
      <div className="bg-surface-high border border-outline-variant rounded-lg p-5 w-[85%] max-w-[320px] shadow-xl">
        <h3 className="text-sm font-bold text-on-surface mb-4">שמור תצוגה</h3>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleClose() }}
          placeholder="שם התצוגה..."
          autoFocus
          dir="rtl"
          className="w-full bg-surface-container border border-outline-variant rounded-md px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary mb-4"
        />
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="flex-1 text-sm font-bold bg-primary text-on-primary rounded-md py-2 hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {saving ? 'שומר...' : 'שמור'}
          </button>
          <button
            onClick={handleClose}
            className="flex-1 text-sm font-bold text-on-surface-variant border border-outline-variant rounded-md py-2 hover:bg-surface-high transition-colors"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Type-check:**

```bash
npx tsc --noEmit
```

- [ ] **Commit:**

```bash
git add src/components/SaveViewDialog.tsx
git commit -m "feat(saved-views): add SaveViewDialog modal component"
```

---

## Task 6: FilterPane — add save button

**Files:**
- Modify: `src/components/FilterPane.tsx`

- [ ] **Add `onSaveRequest` to `FilterPaneProps` interface** (after `onClearAll`):

```ts
  onSaveRequest?: () => void
```

- [ ] **Add `onSaveRequest` to the destructuring in `FilterPane`:**

```tsx
export function FilterPane({
  open, onClose, sections, multiSelect, text,
  onMultiToggle, onMultiClear, onTextChange, onClearAll, onSaveRequest,
}: FilterPaneProps) {
```

- [ ] **Add save button at the bottom of the pane, after `</div>` that wraps sections and before `</div>` that closes the panel:**

```tsx
        {/* Save view button */}
        {onSaveRequest && (
          <div className="shrink-0 px-4 py-3 border-t border-outline-variant">
            <button
              onClick={onSaveRequest}
              className="w-full text-sm font-bold text-primary py-2 rounded-md hover:bg-surface-high transition-colors text-right"
            >
              שמור תצוגה +
            </button>
          </div>
        )}
```

The save button appears only when `onSaveRequest` is provided, so screens that don't implement saving yet are unaffected.

- [ ] **Type-check:**

```bash
npx tsc --noEmit
```

- [ ] **Commit:**

```bash
git add src/components/FilterPane.tsx
git commit -m "feat(saved-views): add save button to FilterPane"
```

---

## Task 7: TrendsScreen — pending filter + save dialog

**Files:**
- Modify: `src/features/trends/TrendsScreen.tsx`

- [ ] **Add imports at the top** (after existing imports):

```tsx
import { useEffect } from 'react'  // already imported, just add to list if missing
import { useLocation, useSearchParams } from 'react-router-dom'
import { decodeFilterState } from '@/features/filters'
import { SaveViewDialog } from '@/components/SaveViewDialog'
import { useSavedViews } from '@/hooks/useSavedViews'
```

Note: `useEffect` is already imported. Add `useLocation` and `useSearchParams` to the react-router-dom import line.

- [ ] **Add state and hooks inside `TrendsScreen()`** (after existing state declarations):

```tsx
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const { saveView: persistView, isSaving } = useSavedViews()
```

- [ ] **Add `useEffect` to apply pending filter on mount** (after existing `useEffect` for tab changes):

```tsx
  // Apply pending filter from sidebar navigation or shared URL
  useEffect(() => {
    const pending = (location.state as { pendingFilter?: FilterState } | null)?.pendingFilter
    if (pending) { setFilterState(pending); return }
    const encoded = searchParams.get('filter')
    if (encoded) {
      const decoded = decodeFilterState(encoded)
      if (decoded) setFilterState(decoded)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally only on mount
```

- [ ] **Pass `onSaveRequest` to `FilterPane`** (in the JSX):

```tsx
        onSaveRequest={() => setSaveDialogOpen(true)}
```

- [ ] **Add `SaveViewDialog`** after the `FilterPane` JSX element:

```tsx
      <SaveViewDialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        onSave={async (name) => {
          await persistView({ name, view: '/trends', filterState })
        }}
      />
```

- [ ] **Type-check:**

```bash
npx tsc --noEmit
```

- [ ] **Commit:**

```bash
git add src/features/trends/TrendsScreen.tsx
git commit -m "feat(saved-views): wire save dialog and pending filter into TrendsScreen"
```

---

## Task 8: DailyDetailScreen — pending filter + save dialog

**Files:**
- Modify: `src/features/daily/DailyDetailScreen.tsx`

- [ ] **Add imports** (add to existing react-router-dom import line):

```tsx
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
```

Add new imports after existing ones:
```tsx
import { decodeFilterState } from '@/features/filters'
import { SaveViewDialog } from '@/components/SaveViewDialog'
import { useSavedViews } from '@/hooks/useSavedViews'
```

- [ ] **Add state inside `DailyDetailScreen()`** (after existing state):

```tsx
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const { saveView: persistView } = useSavedViews()
```

- [ ] **Add `useEffect` to apply pending filter on mount** (after existing `useMemo` blocks, before `toggleGroup`):

```tsx
  useEffect(() => {
    const pending = (location.state as { pendingFilter?: FilterState } | null)?.pendingFilter
    if (pending) { setFilterState(pending); return }
    const encoded = searchParams.get('filter')
    if (encoded) {
      const decoded = decodeFilterState(encoded)
      if (decoded) setFilterState(decoded)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```

- [ ] **Pass `onSaveRequest` to `FilterPane`** in the JSX:

```tsx
        onSaveRequest={() => setSaveDialogOpen(true)}
```

- [ ] **Add `SaveViewDialog`** inside the `<>` fragment at the top of the return (after existing `FilterPane`):

```tsx
      <SaveViewDialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        onSave={async (name) => {
          await persistView({ name, view: '/diary', filterState })
        }}
      />
```

- [ ] **Type-check:**

```bash
npx tsc --noEmit
```

- [ ] **Commit:**

```bash
git add src/features/daily/DailyDetailScreen.tsx
git commit -m "feat(saved-views): wire save dialog and pending filter into DailyDetailScreen"
```

---

## Task 9: Sidebar — saved views section

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Add imports** at the top of `Sidebar.tsx`:

```tsx
import { useSavedViews } from '@/hooks/useSavedViews'
import type { FilterState } from '@/features/filters'
```

- [ ] **Add view-type icon helper** after the existing `TrashIcon` function:

```tsx
function ViewIcon({ view }: { view: string }) {
  if (view === '/trends') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  )
  if (view.startsWith('/diary')) return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  )
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform 150ms', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}
```

- [ ] **Add state inside `Sidebar`** (after existing `removeTarget` state):

```tsx
  const [savedViewsExpanded, setSavedViewsExpanded] = useState(true)
  const [deactivatingId, setDeactivatingId] = useState<number | null>(null)
  const { views, deactivateView: doDeactivate } = useSavedViews()
  const activeViews = views.filter(v => v.active)
```

- [ ] **Add navigate import** — `useNavigate` is already imported. Also add `useLocation` to the existing import if not present:

```tsx
import { useNavigate, useLocation } from 'react-router-dom'
```

- [ ] **Add `location` inside `Sidebar`** (after `navigate`):

```tsx
  const { pathname } = useLocation()
```

(This is already there — just verify it's in the component body.)

- [ ] **Add saved views section in the JSX**, between the `<nav>` close tag and the sheet list section label. Insert after `</nav>`:

```tsx
        {/* Saved views — collapsible */}
        {activeViews.length > 0 && (
          <div className="border-b border-outline-variant">
            <button
              onClick={() => setSavedViewsExpanded(e => !e)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-right"
            >
              <span className="text-[11px] font-mono font-bold text-primary uppercase tracking-wider">
                תצוגות שמורות
              </span>
              <ChevronDownIcon open={savedViewsExpanded} />
            </button>
            {savedViewsExpanded && (
              <div className="pb-2 px-3 space-y-0.5">
                {activeViews.map(view => (
                  <div key={view.rowIndex} className="flex items-center gap-2 rounded-md px-2 group">
                    <button
                      className="flex-1 flex items-center gap-2 py-2.5 text-right text-on-surface-variant hover:text-on-surface transition-colors min-w-0"
                      onClick={() => {
                        navigate(view.view, { state: { pendingFilter: view.filterState as FilterState } })
                        onClose()
                      }}
                    >
                      <span className="shrink-0 text-on-surface-variant/60">
                        <ViewIcon view={view.view} />
                      </span>
                      <span className="text-sm font-medium truncate flex-1">{view.name}</span>
                    </button>
                    {deactivatingId === view.rowIndex ? (
                      <button
                        onClick={() => {
                          doDeactivate(view.rowIndex)
                          setDeactivatingId(null)
                        }}
                        className="text-[10px] font-bold text-error shrink-0 px-1.5 py-1 rounded border border-error/40 hover:bg-error/10 transition-colors"
                      >
                        הסתר
                      </button>
                    ) : (
                      <button
                        onClick={() => setDeactivatingId(view.rowIndex)}
                        className="opacity-0 group-hover:opacity-100 text-on-surface-variant/50 hover:text-on-surface-variant transition-all shrink-0"
                        aria-label="אפשרויות"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
```

- [ ] **Type-check:**

```bash
npx tsc --noEmit
```

- [ ] **Commit:**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat(saved-views): add collapsible saved views section to sidebar"
```

---

## Task 10: Final type-check and branch push

- [ ] **Full type-check:**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Push branch (do NOT merge to main):**

```bash
git push -u origin feature/saved-views
```

- [ ] **Verify commits on branch:**

```bash
git log --oneline main..HEAD
```

Expected: 8–9 commits ahead of main, none merged.
