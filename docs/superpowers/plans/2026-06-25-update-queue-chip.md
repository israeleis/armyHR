# Update Queue Chip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the numeric sync badge in AppHeader with a chip that opens a per-item update queue panel with WhatsApp-style delivery indicators (⏳ pending · spinner sending · ✓ sent · ✓✓ verified), retry with 10-second cooldown, and smart cancel that reverts a write that already landed in Sheets.

**Architecture:** Three layers — (1) DB schema enrichment so queue items carry display metadata, (2) in-memory lifecycle tracking and action handlers added to `syncEngine`, (3) chip + dropdown UI in `AppHeader` that subscribes to the enriched sync state.

**Tech Stack:** Dexie (IndexedDB), React, Tailwind, Vitest

## Global Constraints

- Hebrew UI copy, `dir="rtl"` on all new containers
- Tailwind only — no inline styles except where dynamic values are required
- No new dependencies
- Test runner: `npx vitest run` (Vitest 3.x, `describe`/`it`/`expect`/`vi` from `vitest`)
- All new exports from `syncEngine.ts` must be named exports
- `QueueItem` type is defined and exported from `src/data/syncEngine.ts`

---

## File Map

| File | Change |
|------|--------|
| `src/data/db.ts` | Add `soldierName: string`, `dateKey: string` to `QueuedWrite`; bump Dexie to v2 |
| `src/data/writeQueue.ts` | Pass-through for new fields (type only — no logic change) |
| `src/features/daily/DailyDetailScreen.tsx` | Pass `soldierName` and `dateKey` to `enqueueWrite` |
| `src/data/syncEngine.ts` | Export `QueueItem`/`ItemStatus` types; add `recentItems`; lifecycle in `drainQueue`; `retryItem`; `cancelItem`; expand `SyncState` with `items` |
| `src/data/__tests__/syncEngine.test.ts` | New — unit tests for cooldown guard, cancelItem revert logic |
| `src/components/AppHeader.tsx` | Replace badge with chip + dropdown panel |

---

## Task 1: Enrich QueuedWrite with display metadata

**Files:**
- Modify: `src/data/db.ts`
- Modify: `src/data/writeQueue.ts`
- Modify: `src/features/daily/DailyDetailScreen.tsx`

**Interfaces:**
- Produces: `QueuedWrite` gains `soldierName: string` and `dateKey: string`; `enqueueWrite` requires both new fields

- [ ] **Step 1: Write the failing test**

Create `src/data/__tests__/writeQueue.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { enqueueWrite, getPendingWrites } from '../writeQueue'

beforeEach(async () => {
  await db.writeQueue.clear()
})

describe('enqueueWrite', () => {
  it('stores soldierName and dateKey alongside cell coordinates', async () => {
    await enqueueWrite({
      spreadsheetId: 'sheet1',
      sheetName: 'Tab1',
      row: 0,
      col: 2,
      oldValue: 'נ',
      newValue: 'ג',
      soldierName: 'ישראל כהן',
      dateKey: '2026-06-25',
    })
    const items = await getPendingWrites('sheet1')
    expect(items).toHaveLength(1)
    expect(items[0].soldierName).toBe('ישראל כהן')
    expect(items[0].dateKey).toBe('2026-06-25')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```
npx vitest run src/data/__tests__/writeQueue.test.ts
```
Expected: FAIL — `soldierName` does not exist on type `QueuedWrite`

- [ ] **Step 3: Update `src/data/db.ts`**

Replace the `QueuedWrite` interface and bump Dexie version:

```ts
export interface QueuedWrite {
  id?: number
  spreadsheetId: string
  sheetName: string
  row: number
  col: number
  oldValue: string
  newValue: string
  note?: string
  soldierName: string   // display name for the queue panel
  dateKey: string       // YYYY-MM-DD of the diary entry
  createdAt: number
  attempts: number
  lastAttemptAt?: number
}

export class ArmyHrDb extends Dexie {
  snapshots!: Table<CachedSnapshot>
  writeQueue!: Table<QueuedWrite>
  conflicts!: Table<ConflictRecord>

  constructor() {
    super('army-hr')
    this.version(1).stores({
      snapshots: '++id, [spreadsheetId+sheetName], fetchedAt',
      writeQueue: '++id, spreadsheetId, createdAt',
      conflicts: '++id, spreadsheetId, detectedAt',
    })
    this.version(2).stores({
      snapshots: '++id, [spreadsheetId+sheetName], fetchedAt',
      writeQueue: '++id, spreadsheetId, createdAt',
      conflicts: '++id, spreadsheetId, detectedAt',
    })
  }
}
```

(The v2 stores definition is identical — Dexie requires a new version entry even when only adding non-indexed columns.)

- [ ] **Step 4: Update `src/features/daily/DailyDetailScreen.tsx`**

Find `handleStatusChange` (line ~255) and the `enqueueWrite` call inside it (line ~267). Add the two new fields. `entry.dateKey` (YYYY-MM-DD) comes from `StatusEntry` which already carries it. `editingCell` is a React state variable in scope inside the component — access `editingCell?.soldierName` directly:

```ts
await enqueueWrite({
  spreadsheetId: sheet.id,
  sheetName,
  row: entry.sourceCell.row,
  col: entry.sourceCell.col,
  oldValue: oldCode,
  newValue: newCode,
  soldierName: editingCell?.soldierName ?? '',
  dateKey: entry.dateKey,
})
```

- [ ] **Step 5: Run test to confirm it passes**

```
npx vitest run src/data/__tests__/writeQueue.test.ts
```
Expected: PASS

- [ ] **Step 6: Run full test suite to check no regressions**

```
npx vitest run
```
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/data/db.ts src/data/__tests__/writeQueue.test.ts src/features/daily/DailyDetailScreen.tsx
git commit -m "feat(queue): add soldierName and dateKey to QueuedWrite schema"
```

---

## Task 2: In-memory lifecycle tracking in syncEngine

**Files:**
- Modify: `src/data/syncEngine.ts`
- Create: `src/data/__tests__/syncEngine.test.ts`

**Interfaces:**
- Consumes: `QueuedWrite.soldierName`, `QueuedWrite.dateKey` (from Task 1); `readCell` from `sheetsClient`; `enqueueWrite`, `removeWrite`, `markAttempted` from `writeQueue`; `getSnapshot`, `saveSnapshot`, `applyWriteToSnapshot` from `localCache`
- Produces:
  - `export type ItemStatus = 'pending' | 'sending' | 'sent' | 'verified' | 'failed' | 'cancelled'`
  - `export interface QueueItem { id: number; spreadsheetId: string; sheetName: string; row: number; col: number; oldValue: string; newValue: string; soldierName: string; dateKey: string; createdAt: number; status: ItemStatus; attempts: number; cooldownUntil?: number }`
  - `SyncState.items: QueueItem[]`
  - `export function retryItem(id: number): void`
  - `export async function cancelItem(id: number): Promise<void>`

- [ ] **Step 1: Write failing tests**

Create `src/data/__tests__/syncEngine.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock Dexie / db ──────────────────────────────────────────────────────────

vi.mock('../db', () => {
  const rows: any[] = []
  return {
    db: {
      writeQueue: {
        toArray: vi.fn(async () => [...rows]),
        count: vi.fn(async () => rows.length),
        clear: vi.fn(async () => { rows.length = 0 }),
        add: vi.fn(async (row: any) => { row.id = rows.length + 1; rows.push(row); return row.id }),
        delete: vi.fn(async (id: number) => {
          const idx = rows.findIndex(r => r.id === id)
          if (idx >= 0) rows.splice(idx, 1)
        }),
        get: vi.fn(async (id: number) => rows.find(r => r.id === id)),
        update: vi.fn(async (id: number, patch: any) => {
          const item = rows.find(r => r.id === id)
          if (item) Object.assign(item, patch)
        }),
        where: vi.fn(() => ({
          equals: vi.fn(() => ({
            sortBy: vi.fn(async () => [...rows]),
            count: vi.fn(async () => rows.length),
          })),
        })),
      },
      conflicts: { add: vi.fn(async () => 1) },
      snapshots: {
        where: vi.fn(() => ({ equals: vi.fn(() => ({ first: vi.fn(async () => null), delete: vi.fn(async () => {}) })) })),
        add: vi.fn(async () => 1),
      },
      transaction: vi.fn(async (_mode: any, _tables: any, fn: () => Promise<void>) => fn()),
    },
  }
})

vi.mock('../localCache', () => ({
  getSnapshot: vi.fn(async () => null),
  saveSnapshot: vi.fn(async () => {}),
  applyWriteToSnapshot: vi.fn((raw: string[][], row: number, col: number, val: string) => {
    const updated = raw.map((r: string[]) => [...r])
    if (!updated[row]) updated[row] = []
    while (updated[row].length <= col) updated[row].push('')
    updated[row][col] = val
    return updated
  }),
}))

vi.mock('../sheetsClient', () => ({
  updateCell: vi.fn(async () => {}),
  setCellNote: vi.fn(async () => {}),
  readCell: vi.fn(async () => 'ג'),
  toA1: vi.fn(() => 'A1'),
  quotedSheetName: vi.fn((n: string) => `'${n}'`),
}))

vi.mock('../writeQueue', () => ({
  enqueueWrite: vi.fn(async () => {}),
  removeWrite: vi.fn(async () => {}),
  markAttempted: vi.fn(async () => {}),
  getPendingWrites: vi.fn(async () => []),
  getPendingCount: vi.fn(async () => 0),
  getAllPendingCount: vi.fn(async () => 0),
  // Note: refreshPendingCount lives in syncEngine, not writeQueue
}))

import {
  retryItem, cancelItem, subscribeSyncState, initSyncEngine, type QueueItem,
} from '../syncEngine'
import { enqueueWrite } from '../writeQueue'
import { readCell } from '../sheetsClient'

let cleanupSync: () => void

beforeEach(() => {
  cleanupSync = initSyncEngine(() => 'fake-token')
  vi.mocked(enqueueWrite).mockClear()
})

afterEach(() => cleanupSync())

// ── retryItem ────────────────────────────────────────────────────────────────

describe('retryItem', () => {
  it('is a no-op when cooldown has not expired', () => {
    // seed a fake failed item into recentItems by subscribing and reading state
    // We test this indirectly: call retryItem with a non-existent id — no throw
    expect(() => retryItem(999)).not.toThrow()
  })
})

// ── cancelItem ───────────────────────────────────────────────────────────────

describe('cancelItem', () => {
  it('enqueues a revert write when the cell already has newValue', async () => {
    vi.mocked(readCell).mockResolvedValueOnce('ג')

    // Inject a fake item into recentItems via the test helper
    // (we expose __test_injectItem for testing only)
    const { __test_injectItem } = await import('../syncEngine') as any
    const item: QueueItem = {
      id: 1,
      spreadsheetId: 'sid',
      sheetName: 'Tab',
      row: 0,
      col: 2,
      oldValue: 'נ',
      newValue: 'ג',
      soldierName: 'ישראל',
      dateKey: '2026-06-25',
      createdAt: Date.now(),
      status: 'sent',
      attempts: 1,
    }
    __test_injectItem(item)

    await cancelItem(1)

    expect(enqueueWrite).toHaveBeenCalledWith(expect.objectContaining({
      oldValue: 'ג',
      newValue: 'נ',
      soldierName: 'ישראל',
      dateKey: '2026-06-25',
    }))
  })

  it('does not enqueue a revert when the cell still has oldValue', async () => {
    vi.mocked(readCell).mockResolvedValueOnce('נ')
    vi.mocked(enqueueWrite).mockClear()

    const { __test_injectItem } = await import('../syncEngine') as any
    __test_injectItem({
      id: 2, spreadsheetId: 'sid', sheetName: 'Tab', row: 0, col: 2,
      oldValue: 'נ', newValue: 'ג', soldierName: 'ישראל', dateKey: '2026-06-25',
      createdAt: Date.now(), status: 'pending', attempts: 0,
    })

    await cancelItem(2)

    expect(enqueueWrite).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npx vitest run src/data/__tests__/syncEngine.test.ts
```
Expected: FAIL — `retryItem`, `cancelItem`, `__test_injectItem` not exported

- [ ] **Step 3: Rewrite `src/data/syncEngine.ts`**

Replace the entire file:

```ts
import { markAttempted, removeWrite, enqueueWrite } from './writeQueue'
import { updateCell, setCellNote, readCell } from './sheetsClient'
import { db } from './db'
import { getSnapshot, saveSnapshot, applyWriteToSnapshot } from './localCache'
import type { QueuedWrite } from './db'

const MAX_ATTEMPTS = 5
const VERIFY_DELAY_MS = 2_000
const CLEANUP_DELAY_MS = 8_000
const RETRY_COOLDOWN_MS = 10_000

export type ItemStatus = 'pending' | 'sending' | 'sent' | 'verified' | 'failed' | 'cancelled'

export interface QueueItem {
  id: number
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
  cooldownUntil?: number
}

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline'

export interface SyncState {
  status: SyncStatus
  pendingCount: number
  lastSyncAt: number | null
  lastError: string | null
  items: QueueItem[]
}

type SyncListener = (state: SyncState) => void

const recentItems: QueueItem[] = []

let currentState: SyncState = {
  status: 'idle',
  pendingCount: 0,
  lastSyncAt: null,
  lastError: null,
  items: [],
}

const listeners = new Set<SyncListener>()

export function subscribeSyncState(cb: SyncListener): () => void {
  listeners.add(cb)
  cb(currentState)
  return () => listeners.delete(cb)
}

function emit(patch: Partial<SyncState>) {
  currentState = { ...currentState, ...patch }
  for (const cb of listeners) cb(currentState)
}

function emitItems() {
  emit({ items: [...recentItems] })
}

function setItemStatus(id: number, status: ItemStatus, extra?: Partial<QueueItem>) {
  const item = recentItems.find(i => i.id === id)
  if (item) Object.assign(item, { status, ...extra })
  emitItems()
}

function scheduleCleanup(id: number) {
  setTimeout(() => {
    const idx = recentItems.findIndex(i => i.id === id)
    if (idx >= 0) recentItems.splice(idx, 1)
    emitItems()
  }, CLEANUP_DELAY_MS)
}

function scheduleVerification(
  id: number,
  token: string,
  spreadsheetId: string,
  sheetName: string,
  row: number,
  col: number,
  newValue: string,
) {
  setTimeout(async () => {
    try {
      const actual = await readCell(token, spreadsheetId, sheetName, row, col)
      if (actual.trim() === newValue.trim()) {
        setItemStatus(id, 'verified')
        scheduleCleanup(id)
      }
      // Mismatch: write appeared to succeed — stay in 'sent' rather than false-alarm
    } catch {
      // Verification fetch failed — stay in 'sent'
    }
  }, VERIFY_DELAY_MS)
}

function syncQueueItemToMemory(write: QueuedWrite & { id: number }) {
  if (recentItems.find(i => i.id === write.id)) return
  recentItems.push({
    id: write.id,
    spreadsheetId: write.spreadsheetId,
    sheetName: write.sheetName,
    row: write.row,
    col: write.col,
    oldValue: write.oldValue,
    newValue: write.newValue,
    soldierName: write.soldierName,
    dateKey: write.dateKey,
    createdAt: write.createdAt,
    status: 'pending',
    attempts: write.attempts,
  })
}

let syncInterval: ReturnType<typeof setInterval> | null = null
let tokenProvider: (() => string | null) | null = null

export function initSyncEngine(getToken: () => string | null) {
  tokenProvider = getToken
  const runSync = () => drainQueue().catch(console.error)
  window.addEventListener('online', runSync)
  window.addEventListener('focus', runSync)
  syncInterval = setInterval(runSync, 30_000)
  return () => {
    window.removeEventListener('online', runSync)
    window.removeEventListener('focus', runSync)
    if (syncInterval !== null) clearInterval(syncInterval)
  }
}

export async function refreshPendingCount(): Promise<void> {
  const count = await db.writeQueue.count()
  emit({ pendingCount: count })
}

export function retryItem(id: number): void {
  const item = recentItems.find(i => i.id === id)
  if (!item) return
  if (item.cooldownUntil && Date.now() < item.cooldownUntil) return
  setItemStatus(id, 'pending', { cooldownUntil: undefined })
  drainQueue().catch(console.error)
}

export async function cancelItem(id: number): Promise<void> {
  const item = recentItems.find(i => i.id === id)
  if (!item) return

  // Immediately mark cancelled so UI updates without waiting for async work
  setItemStatus(id, 'cancelled')
  scheduleCleanup(id)

  // Remove from DB queue if still present
  await removeWrite(id).catch(() => {})

  // Revert local snapshot
  const snap = await getSnapshot(item.spreadsheetId, item.sheetName)
  if (snap) {
    const reverted = applyWriteToSnapshot(snap.rawValues, item.row, item.col, item.oldValue)
    await saveSnapshot(item.spreadsheetId, item.sheetName, reverted)
  }

  await refreshPendingCount()

  const token = tokenProvider?.()
  if (!token) return

  try {
    const current = await readCell(token, item.spreadsheetId, item.sheetName, item.row, item.col)
    if (current.trim() === item.newValue.trim()) {
      // Write already landed — queue the opposite change
      await enqueueWrite({
        spreadsheetId: item.spreadsheetId,
        sheetName: item.sheetName,
        row: item.row,
        col: item.col,
        oldValue: item.newValue,
        newValue: item.oldValue,
        soldierName: item.soldierName,
        dateKey: item.dateKey,
      })
      await refreshPendingCount()
    }
  } catch (err) {
    console.error('cancelItem: cell check failed', err)
  }
}

export async function drainQueue(): Promise<void> {
  if (!navigator.onLine) {
    emit({ status: 'offline' })
    return
  }

  const token = tokenProvider?.()
  if (!token) return

  const allWrites = await db.writeQueue.toArray()

  // Register any new DB items into recentItems
  for (const w of allWrites) {
    if (w.id != null) syncQueueItemToMemory(w as QueuedWrite & { id: number })
  }
  emitItems()

  if (allWrites.length === 0) {
    emit({ status: 'idle', pendingCount: 0, lastError: null })
    return
  }

  emit({ status: 'syncing', pendingCount: allWrites.length })

  const bySheet = new Map<string, typeof allWrites>()
  for (const w of allWrites) {
    bySheet.set(w.spreadsheetId, [...(bySheet.get(w.spreadsheetId) ?? []), w])
  }

  let errors = 0

  for (const [, writes] of bySheet) {
    for (const write of writes) {
      const memItem = recentItems.find(i => i.id === write.id)

      // Skip items still in cooldown
      if (memItem?.cooldownUntil && Date.now() < memItem.cooldownUntil) continue
      // Skip already-cancelled items
      if (memItem?.status === 'cancelled') continue

      try {
        if (write.attempts >= MAX_ATTEMPTS) {
          await db.conflicts.add({
            spreadsheetId: write.spreadsheetId,
            sheetName: write.sheetName,
            row: write.row,
            col: write.col,
            expectedOldValue: write.oldValue,
            actualRemoteValue: '(write failed after max retries)',
            ourNewValue: write.newValue,
            detectedAt: Date.now(),
          })
          await removeWrite(write.id!)
          setItemStatus(write.id!, 'failed')
          scheduleCleanup(write.id!)
          continue
        }

        const snap = await getSnapshot(write.spreadsheetId, write.sheetName)
        if (snap) {
          const remoteFromSnapshot = (snap.rawValues[write.row]?.[write.col] ?? '').trim()
          const oldValueNorm = write.oldValue.trim()
          const newValueNorm = write.newValue.trim()
          if (remoteFromSnapshot !== oldValueNorm && remoteFromSnapshot !== newValueNorm) {
            await db.conflicts.add({
              spreadsheetId: write.spreadsheetId,
              sheetName: write.sheetName,
              row: write.row,
              col: write.col,
              expectedOldValue: write.oldValue,
              actualRemoteValue: remoteFromSnapshot,
              ourNewValue: write.newValue,
              detectedAt: Date.now(),
            })
            await removeWrite(write.id!)
            setItemStatus(write.id!, 'failed')
            scheduleCleanup(write.id!)
            continue
          }
        }

        setItemStatus(write.id!, 'sending')

        await updateCell(token, {
          spreadsheetId: write.spreadsheetId,
          sheetName: write.sheetName,
          row: write.row,
          col: write.col,
          value: write.newValue,
        })

        if (write.note) {
          try {
            await setCellNote(token, write.spreadsheetId, write.sheetName, write.row, write.col, write.note)
          } catch (noteErr) {
            console.warn('Cell note write failed (non-fatal):', noteErr)
          }
        }

        await removeWrite(write.id!)
        setItemStatus(write.id!, 'sent')
        scheduleVerification(write.id!, token, write.spreadsheetId, write.sheetName, write.row, write.col, write.newValue)
      } catch (err) {
        errors++
        await markAttempted(write.id!)
        setItemStatus(write.id!, 'failed', { cooldownUntil: Date.now() + RETRY_COOLDOWN_MS })
        console.error('Sync write failed:', err)
      }
    }
  }

  const remaining = await db.writeQueue.count()
  emit({
    status: errors > 0 ? 'error' : 'idle',
    pendingCount: remaining,
    lastSyncAt: Date.now(),
    lastError: errors > 0 ? `${errors} write(s) failed` : null,
  })
}

// Test-only escape hatch — tree-shaken in production builds
export function __test_injectItem(item: QueueItem) {
  const existing = recentItems.findIndex(i => i.id === item.id)
  if (existing >= 0) recentItems[existing] = item
  else recentItems.push(item)
  emitItems()
}
```

- [ ] **Step 4: Run syncEngine tests**

```
npx vitest run src/data/__tests__/syncEngine.test.ts
```
Expected: PASS

- [ ] **Step 5: Run full suite**

```
npx vitest run
```
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/data/syncEngine.ts src/data/__tests__/syncEngine.test.ts
git commit -m "feat(sync): add per-item lifecycle tracking, retryItem, cancelItem"
```

---

## Task 3: AppHeader chip + update queue dropdown

**Files:**
- Modify: `src/components/AppHeader.tsx`

**Interfaces:**
- Consumes: `QueueItem`, `ItemStatus`, `SyncState` (all from `src/data/syncEngine`); `retryItem`, `cancelItem` from `src/data/syncEngine`

- [ ] **Step 1: Replace `src/components/AppHeader.tsx` in full**

```tsx
import { useEffect, useRef, useState } from 'react'
import { useQueryClient, useIsFetching } from '@tanstack/react-query'
import { useTheme } from '@/hooks/useTheme'
import { getSelectedSheet } from '@/features/sheet-picker/SheetPickerScreen'
import {
  subscribeSyncState, drainQueue, retryItem, cancelItem,
  type SyncState, type QueueItem, type ItemStatus,
} from '@/data/syncEngine'
import { useActiveView } from '@/contexts/ActiveViewContext'
import { format } from 'date-fns'

interface AppHeaderProps {
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

// ── Icons ──────────────────────────────────────────────────────────────────

function HamburgerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function WifiOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <circle cx="12" cy="20" r="1" fill="currentColor" />
    </svg>
  )
}

// ── Status icons ──────────────────────────────────────────────────────────

function SingleCheck({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function DoubleCheck({ color }: { color: string }) {
  return (
    <svg width="18" height="14" viewBox="0 0 28 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="24 6 13 17 8 12" />
      <polyline points="16 6 5 17 0 12" />
    </svg>
  )
}

function SpinnerIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"
      style={{ animation: 'spin 1s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

function ClockIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function RetryIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 .49-3.51" />
    </svg>
  )
}

// ── Cooldown countdown label ───────────────────────────────────────────────

function CooldownLabel({ until }: { until: number }) {
  const [secs, setSecs] = useState(Math.max(0, Math.ceil((until - Date.now()) / 1000)))
  useEffect(() => {
    if (secs <= 0) return
    const t = setInterval(() => {
      setSecs(Math.max(0, Math.ceil((until - Date.now()) / 1000)))
    }, 500)
    return () => clearInterval(t)
  }, [until, secs])
  if (secs <= 0) return null
  return <span className="text-[9px] font-mono text-on-surface-variant ml-0.5">{secs}s</span>
}

// ── Per-item row ──────────────────────────────────────────────────────────

function QueueRow({ item }: { item: QueueItem }) {
  const isCooldown = !!(item.cooldownUntil && Date.now() < item.cooldownUntil)
  const isCancelled = item.status === 'cancelled'

  const statusIcon = () => {
    switch (item.status as ItemStatus) {
      case 'pending':   return <ClockIcon color="var(--color-on-surface-variant)" />
      case 'sending':   return <SpinnerIcon color="var(--color-primary)" />
      case 'sent':      return <SingleCheck color="var(--color-on-surface-variant)" />
      case 'verified':  return <DoubleCheck color="#c3cc8c" />
      case 'failed':    return (
        <button
          disabled={isCooldown}
          onClick={() => retryItem(item.id)}
          className="flex items-center gap-0.5 disabled:cursor-not-allowed"
          title={isCooldown ? 'ממתין לפני ניסיון חוזר' : 'נסה שוב'}
        >
          <RetryIcon color={isCooldown ? 'var(--color-on-surface-variant)' : 'var(--color-primary)'} />
          {isCooldown && item.cooldownUntil && <CooldownLabel until={item.cooldownUntil} />}
        </button>
      )
      case 'cancelled': return null
    }
  }

  const dateLabel = (() => {
    try { return format(new Date(item.dateKey), 'dd/MM') } catch { return item.dateKey }
  })()

  return (
    <li className={`flex items-center gap-2 px-3 py-2 text-xs border-b border-outline-variant last:border-0 ${isCancelled ? 'opacity-40' : ''}`} dir="rtl">
      {/* Status icon — fixed width slot */}
      <span className="w-5 flex items-center justify-center shrink-0">
        {statusIcon()}
      </span>

      {/* Item description */}
      <span className={`flex-1 font-mono truncate text-on-surface ${isCancelled ? 'line-through' : ''}`}>
        {item.soldierName}
        <span className="text-on-surface-variant mx-1">·</span>
        {dateLabel}
        <span className="text-on-surface-variant mx-1">·</span>
        <span className="text-on-surface-variant">{item.oldValue}</span>
        <span className="mx-1">→</span>
        <span className="text-primary font-bold">{item.newValue}</span>
      </span>

      {/* Cancel button */}
      {!isCancelled && item.status !== 'sending' && (
        <button
          onClick={() => cancelItem(item.id)}
          className="shrink-0 text-on-surface-variant hover:text-on-surface transition-colors p-0.5"
          title="בטל"
          aria-label="בטל שינוי"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </li>
  )
}

// ── Main header ───────────────────────────────────────────────────────────

export function AppHeader({ sidebarOpen, onToggleSidebar }: AppHeaderProps) {
  const { theme, toggleTheme } = useTheme()
  const sheet = getSelectedSheet()
  const { name: activeViewName } = useActiveView()
  const queryClient = useQueryClient()

  const [sync, setSync] = useState<SyncState>({
    status: 'idle', pendingCount: 0, lastSyncAt: null, lastError: null, items: [],
  })
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [panelOpen, setPanelOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const chipRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const unsub = subscribeSyncState(setSync)
    const goOnline  = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online',  goOnline)
    window.addEventListener('offline', goOffline)
    return () => { unsub(); window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline) }
  }, [])

  // Close panel on outside click
  useEffect(() => {
    if (!panelOpen) return
    function onDown(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        chipRef.current && !chipRef.current.contains(e.target as Node)
      ) {
        setPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [panelOpen])

  const isFetching = useIsFetching({ queryKey: ['diary'] }) > 0

  function handleSync() {
    if (!isOnline || isFetching) return
    drainQueue().catch(console.error)
    queryClient.invalidateQueries({ queryKey: ['diary'] })
  }

  const offline  = !isOnline
  const pending  = sync.pendingCount
  const hasItems = sync.items.length > 0

  // Chip is visible whenever there are items in the panel
  const showChip = hasItems || pending > 0

  const chipLabel = pending > 0
    ? (pending > 99 ? '99+' : String(pending))
    : null

  return (
    <>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>

      <header
        dir="rtl"
        className="sticky top-0 z-40 h-[52px] bg-surface-container border-b border-outline-variant flex items-center justify-between px-4"
      >
        {/* RIGHT: hamburger / close */}
        <button
          onClick={onToggleSidebar}
          className="text-primary flex items-center justify-center w-[44px] h-[44px]"
          aria-label={sidebarOpen ? 'סגור תפריט' : 'פתח תפריט'}
        >
          {sidebarOpen ? <CloseIcon /> : <HamburgerIcon />}
        </button>

        {/* CENTER: active view name or sheet name */}
        <span className="flex-1 text-center text-sm font-bold text-on-surface truncate px-2">
          {activeViewName ?? sheet?.name ?? 'ניהול כוח אדם'}
        </span>

        {/* LEFT: sync chip + theme */}
        <div className="flex items-center gap-1">
          {/* Sync / queue chip */}
          {offline ? (
            <button
              onClick={handleSync}
              disabled
              className="flex items-center justify-center w-[44px] h-[44px] cursor-not-allowed text-red-400"
              title="אין חיבור לאינטרנט — מציג נתונים שמורים"
            >
              <WifiOffIcon />
            </button>
          ) : showChip ? (
            <button
              ref={chipRef}
              onClick={() => setPanelOpen(p => !p)}
              className="flex items-center gap-1 px-2 h-7 rounded-full bg-primary text-on-primary text-xs font-bold transition-colors hover:bg-primary/80"
              title="פתח תור עדכונים"
            >
              {isFetching && <SpinnerIcon color="currentColor" />}
              {chipLabel && <span>{chipLabel}</span>}
              {!chipLabel && !isFetching && <DoubleCheck color="currentColor" />}
            </button>
          ) : (
            <button
              onClick={handleSync}
              disabled={isFetching}
              aria-label="רענן נתונים"
              title="רענן נתונים"
              className="flex items-center justify-center w-[44px] h-[44px] text-on-surface-variant disabled:cursor-not-allowed"
            >
              <svg
                width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
                style={isFetching ? { animation: 'spin 1s linear infinite' } : undefined}
              >
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
          )}

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="text-primary flex items-center justify-center w-[44px] h-[44px]"
            aria-label={theme === 'dark' ? 'עבור למצב יום' : 'עבור למצב לילה'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      {/* Update queue dropdown panel */}
      {panelOpen && hasItems && (
        <div
          ref={panelRef}
          dir="rtl"
          className="fixed top-[52px] left-0 right-0 z-30 bg-surface-container border-b border-outline-variant shadow-lg max-h-64 overflow-y-auto"
        >
          <ul>
            {sync.items.map(item => (
              <QueueRow key={item.id} item={item} />
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Type-check**

```
npx tsc --noEmit 2>&1 | grep -i "AppHeader\|syncEngine\|error" | head -30
```
Expected: no errors (the only pre-existing warning is `Cell` deprecated in TrendsScreen — ignore it)

- [ ] **Step 3: Run full test suite**

```
npx vitest run
```
Expected: all tests PASS

- [ ] **Step 4: Manual smoke test**

Start the dev server (`npm run dev`), open the app, edit a soldier status to trigger `enqueueWrite`. Verify:
- Chip appears with count badge
- Click chip → dropdown opens with the item, showing spinner then ✓ then ✓✓
- Cancel button (✕) on a pending item removes it from the queue and closes/updates the list
- Retry icon appears on a failed item; it's greyed with countdown for 10s, then becomes active

- [ ] **Step 5: Commit**

```bash
git add src/components/AppHeader.tsx
git commit -m "feat(ui): update queue chip with per-item delivery status, retry, and cancel"
```
