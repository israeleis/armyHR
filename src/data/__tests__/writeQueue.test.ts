import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { QueuedWrite } from '../db'

// Mock the Dexie db so the test runs without a real IndexedDB environment
const store: QueuedWrite[] = []
let nextId = 1

vi.mock('../db', () => ({
  db: {
    writeQueue: {
      clear: async () => { store.length = 0; nextId = 1 },
      add: async (item: QueuedWrite) => {
        const id = nextId++
        store.push({ ...item, id })
        return id
      },
      where: (field: string) => ({
        equals: (val: unknown) => ({
          sortBy: async (_key: string) =>
            store.filter((r) => (r as unknown as Record<string, unknown>)[field] === val),
          count: async () =>
            store.filter((r) => (r as unknown as Record<string, unknown>)[field] === val).length,
        }),
      }),
    },
  },
}))

import { enqueueWrite, getPendingWrites } from '../writeQueue'

beforeEach(async () => {
  store.length = 0
  nextId = 1
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
