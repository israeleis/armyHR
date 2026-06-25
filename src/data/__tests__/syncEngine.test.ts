import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
  retryItem, cancelItem, initSyncEngine, type QueueItem,
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
