# Update Queue Chip — Design Spec

**Date:** 2026-06-25  
**Feature:** Per-item sync status panel with WhatsApp-style delivery indicators, retry, and cancel

---

## Problem

The current AppHeader shows a numeric badge (e.g. "3") on the sync icon to indicate pending writes. Users have no way to see what is being written, whether it landed in Google Sheets, or to cancel or retry individual items.

---

## Scope

1. Enrich `QueuedWrite` with display metadata (soldier name + date)
2. Track per-item lifecycle in-memory inside `syncEngine`
3. Add verification fetch after each successful API write
4. Render a chip in `AppHeader` that opens a dropdown item list
5. Per-item actions: retry (with 10-second cooldown) and cancel (with smart revert)

---

## Data Model Changes

### `QueuedWrite` — new fields (Dexie v2 migration)

```ts
soldierName: string   // display name of the soldier whose status changed
dateKey: string       // YYYY-MM-DD of the diary entry
```

`DailyDetailScreen` already has both values in scope at `enqueueWrite` call time. Pass them through.

---

## In-Memory Item Lifecycle (`syncEngine`)

Items leave IndexedDB when written. A module-level `recentItems` array (max ~50 entries) tracks their full lifecycle:

```ts
type ItemStatus = 'pending' | 'sending' | 'sent' | 'verified' | 'failed' | 'cancelled'

interface QueueItem {
  id: number              // DB id (while in queue); synthetic id after removal
  spreadsheetId: string
  sheetName: string
  row: number
  col: number
  oldValue: string
  newValue: string
  soldierName: string
  dateKey: string
  createdAt: number
  status: ItemStatus
  attempts: number
  cooldownUntil?: number  // Date.now() + 10_000 after each failed attempt
}
```

**State transitions:**
```
pending → sending → sent → verified   (happy path, item fades out after ~8s)
                  → failed            (show retry icon, cooldown 10s)
pending → cancelled                   (user cancelled before write)
sent    → cancelled                   (user cancelled after write — triggers revert enqueue)
```

`subscribeSyncState` broadcast expands to include `items: QueueItem[]` alongside the existing `SyncState` fields.

Items auto-remove from `recentItems` 8 seconds after reaching `verified` or `cancelled`. `failed` items persist until the user retries, cancels, or exhausts `MAX_ATTEMPTS`.

---

## Sync Engine Changes

### `drainQueue`

Before writing each item, emit `status: 'sending'` for that item.  
After `removeWrite(id)` succeeds:
- Emit `status: 'sent'` for that item
- Schedule verification: after 2s, call `readCell(token, ...)` and compare to `newValue`
  - Match → emit `status: 'verified'`, schedule fade-out at +8s
  - Mismatch → emit `status: 'failed'`, set `cooldownUntil: Date.now() + 10_000`

On write error:
- Emit `status: 'failed'`, set `cooldownUntil: Date.now() + 10_000`

### Manual retry action

Exposed as `retryItem(id: number)`:
- Guard: if `cooldownUntil > Date.now()`, no-op
- Set item status back to `pending`
- Call `drainQueue()` immediately

### Cancel action

Exposed as `cancelItem(id: number, getToken: () => string | null)`:

```
1. Remove item from DB write queue (if id still exists)
2. Revert local snapshot: applyWriteToSnapshot(spreadsheetId, sheetName, row, col, oldValue)
3. Fetch current cell: readCell(token, spreadsheetId, sheetName, row, col)
4. If cell == newValue → enqueueWrite({ ...item, oldValue: newValue, newValue: oldValue })
                          and call refreshPendingCount()
   If cell == oldValue → done (write never landed)
5. Emit status: 'cancelled' for that item, schedule fade-out at +8s
```

The cancel action is **non-blocking in the UI** — the item immediately shows `cancelled` while the fetch + optional revert enqueue happen in the background.

---

## UI — AppHeader Chip

The existing numeric badge is replaced by a chip that is only visible when `items.length > 0` or `pendingCount > 0`.

**Chip appearance:**
- Small pill, shows pending count if > 0, otherwise a checkmark when all verified
- Clicking toggles the dropdown panel

**Dropdown panel** (fixed, below header, full-width, max-height scrollable, `dir="rtl"`):

Each row:
```
[icon]  שם חייל  ·  dd/MM  ·  קוד ישן → קוד חדש      [cancel]
```

| Status | Icon | Color |
|--------|------|-------|
| `pending` | ⏳ | muted |
| `sending` | spinner | primary |
| `sent` | ✓ (single, thin) | muted |
| `verified` | ✓✓ (double, bold) | green (`#c3cc8c`) |
| `failed` (cooldown active) | ↺ (frozen, disabled) | muted + countdown ring or seconds label |
| `failed` (cooldown expired) | ↺ (active, tappable) | primary |
| `cancelled` | — (strikethrough row) | muted, fading out |

**Cancel button:** small ✕ on the right of each row. Disabled during `sending` and after `cancelled`.

**Retry:** tapping the ↺ icon calls `retryItem`. Disabled if `cooldownUntil > Date.now()`. Cooldown remaining shown as a seconds label (e.g. "7s") next to the icon, updated by a local interval.

---

## Files Affected

| File | Change |
|------|--------|
| `src/data/db.ts` | Add `soldierName`, `dateKey` to `QueuedWrite`; bump Dexie to v2 |
| `src/data/writeQueue.ts` | Pass-through for new fields |
| `src/data/syncEngine.ts` | `QueueItem` type, `recentItems`, lifecycle tracking, `retryItem`, `cancelItem`, verification fetch |
| `src/features/daily/DailyDetailScreen.tsx` | Pass `soldierName` and `dateKey` to `enqueueWrite` |
| `src/components/AppHeader.tsx` | Replace badge with chip + dropdown panel |

---

## Out of Scope

- Persisting `recentItems` across page reloads (memory-only is fine)
- Conflict records (already handled separately in `db.conflicts`)
- Multi-item bulk cancel/retry
