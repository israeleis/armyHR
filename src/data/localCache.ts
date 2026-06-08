import { db } from './db'
import type { CachedSnapshot } from './db'

/** Save a fresh snapshot (overwrites existing for same spreadsheetId + sheetName) */
export async function saveSnapshot(
  spreadsheetId: string,
  sheetName: string,
  rawValues: string[][],
): Promise<void> {
  // Delete existing snapshot for this sheet first
  await db.snapshots
    .where('[spreadsheetId+sheetName]')
    .equals([spreadsheetId, sheetName])
    .delete()
  await db.snapshots.add({ spreadsheetId, sheetName, rawValues, fetchedAt: Date.now() })
}

/** Get the most recent cached snapshot, or null */
export async function getSnapshot(
  spreadsheetId: string,
  sheetName: string,
): Promise<CachedSnapshot | null> {
  const snap = await db.snapshots
    .where('[spreadsheetId+sheetName]')
    .equals([spreadsheetId, sheetName])
    .first()
  return snap ?? null
}

/** Apply a pending write mutation to the cached snapshot in memory */
export function applyWriteToSnapshot(
  rawValues: string[][],
  row: number,
  col: number,
  newValue: string,
): string[][] {
  const updated = rawValues.map(r => [...r])
  if (!updated[row]) updated[row] = []
  // Pad row if necessary
  while (updated[row].length <= col) updated[row].push('')
  updated[row][col] = newValue
  return updated
}
