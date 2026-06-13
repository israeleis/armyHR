# Saved Views — Design Spec

**Date:** 2026-06-14  
**Status:** Approved

---

## Overview

Users can save named filter configurations ("views") from any screen that has a FilterPane. Saved views are persisted to a dedicated tab (`_app_custom_views`) in the active Google Sheet, making them visible to all users of that sheet. The sidebar shows a collapsible saved-views section for fast one-click application.

---

## 1. Data Layer

### Sheet: `_app_custom_views`

Auto-created on first save if the tab does not exist.

| Col | Field | Type | Notes |
|-----|-------|------|-------|
| A | name | string | User-given label |
| B | view | string | Route path: `/trends`, `/diary`, etc. |
| C | sheet_id | string | Spreadsheet ID (scopes view to this sheet) |
| D | tab_name | string | Active tab name when saved |
| E | filter_json | string | JSON: `{ multiSelect: Record<string, string[]>, text: Record<string, string> }` |
| F | active | string | `"TRUE"` or `"FALSE"` |
| G | created_by | string | Google account email |
| H | created_at | string | ISO 8601 timestamp |

Row 1 is always the header row. Data starts at row 2.  
Creator and timestamp are saved to the sheet but never shown in the UI.

### Filter serialization

`FilterState` uses `Set<string>` for multi-select values, which is not JSON-serializable. A `SerializedFilterState` type uses `string[]` instead:

```ts
type SerializedFilterState = {
  multiSelect: Record<string, string[]>
  text: Record<string, string>
}
```

Two helpers in `src/features/filters/index.ts`:
- `serializeFilterState(state: FilterState): string` — converts Sets to arrays, returns JSON string
- `deserializeFilterState(json: string): FilterState` — parses JSON, converts arrays back to Sets

### New Sheets API helpers (`src/data/sheetsClient.ts`)

- `ensureTabExists(token, spreadsheetId, tabName)` — calls `batchUpdate` addSheet; no-ops if tab already exists (catches "already exists" error)
- `appendRow(token, spreadsheetId, tabName, values: string[])` — calls `values/{range}:append?valueInputOption=USER_ENTERED`

### `src/data/customViewsClient.ts` (new)

```ts
interface SavedView {
  rowIndex: number    // 1-indexed sheet row (for updates)
  name: string
  view: string        // route path
  sheetId: string
  tabName: string
  filterState: FilterState
  active: boolean
  createdBy: string
  createdAt: string
}

// Load all active views for the current spreadsheet (any tab)
loadSavedViews(token, spreadsheetId): Promise<SavedView[]>

// Append a new view row (creates tab + header if needed)
saveView(token, spreadsheetId, view: Omit<SavedView, 'rowIndex'>): Promise<void>

// Set column F to FALSE for the given row
deactivateView(token, spreadsheetId, rowIndex: number): Promise<void>
```

---

## 2. Filter URL Support (read-only)

Screens with filters support a `?filter=<base64>` URL search param for shared deep links. The app never writes to the URL — it only reads on mount.

**Loading priority (on mount):**
1. `useLocation().state.pendingFilter` — from sidebar navigation (no decoding needed)
2. `useSearchParams().get('filter')` — base64-decoded JSON from a shared URL
3. Empty filter (default)

**Encoding:** `btoa(serializeFilterState(state))` — base64 of the JSON string.

---

## 3. Components

### New

| File | Purpose |
|------|---------|
| `src/data/customViewsClient.ts` | CRUD for `_app_custom_views` |
| `src/hooks/useSavedViews.ts` | React Query hook; loads on sidebar open, invalidates on save |
| `src/components/SaveViewDialog.tsx` | Modal: name input + Save/Cancel |

### Modified

| File | Change |
|------|--------|
| `src/features/filters/index.ts` | Add `serializeFilterState`, `deserializeFilterState` |
| `src/data/sheetsClient.ts` | Add `ensureTabExists`, `appendRow` |
| `src/components/FilterPane.tsx` | Add "שמור תצוגה" button at bottom; new `onSaveRequest` prop |
| `src/components/Sidebar.tsx` | Add collapsible "תצוגות שמורות" section between nav and sheet history |
| `src/features/trends/TrendsScreen.tsx` | Read pending filter from location state or URL on mount |
| `src/features/daily/DailyDetailScreen.tsx` | Same |

---

## 4. UI Flows

### Saving a view

1. User has an active filter in FilterPane
2. Clicks "שמור תצוגה" button at the bottom of FilterPane
3. `SaveViewDialog` appears (modal overlay, RTL)
4. User types a name and clicks "שמור"
5. `saveView()` runs: ensures tab exists → appends row
6. `useSavedViews` query is invalidated → sidebar refreshes
7. FilterPane closes; brief success state on the button

### Applying a saved view

1. User opens sidebar
2. "תצוגות שמורות" section shows all active views for the current spreadsheet
3. User taps a view row
4. `navigate({ pathname: view }, { state: { pendingFilter: filterState } })`
5. Target screen mounts, reads location state, applies filter
6. Sidebar closes

### Deactivating a view

1. User taps the ⋯ icon on a saved view row in the sidebar
2. A small dropdown shows "הסתר"
3. `deactivateView(rowIndex)` sets column F to `"FALSE"`
4. View disappears from sidebar; `useSavedViews` re-fetches

---

## 5. Sidebar Layout

```
── Nav ──────────────────────────────
  📊  דשבורד
  📅  יומן

── תצוגות שמורות  ▾  ─────────────── ← collapsible (default: open)
  📊  חיילים חוץ      מגמות    ⋯
  📅  פלוגה א׳         יומן    ⋯

── גיליונות שנפתחו ───────────────────
  Sheet 1  ✓ פעיל
  Sheet 2
```

- Chevron toggles collapse; state stored in component (not persisted)
- Icon indicates view type: 📊 for `/trends`, 📅 for `/diary`, 🔍 for unknown future views
- Small muted label shows the screen name
- ⋯ opens inline "הסתר" option

---

## 6. Scope Boundaries

**In scope:**
- Save, load, deactivate views
- Sidebar collapsible section
- URL read (shared links)
- Works for `/trends` and `/diary` today; any future screen with FilterPane adds support automatically via `onSaveRequest`

**Out of scope (future):**
- "Copy shareable link" button (URL write)
- Rename views
- View ordering / pinning
- Conflict resolution if two users save simultaneously
