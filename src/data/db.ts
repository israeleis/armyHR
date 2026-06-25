import Dexie, { type Table } from 'dexie'

export interface CachedSnapshot {
  id?: number
  spreadsheetId: string
  sheetName: string
  rawValues: string[][]
  fetchedAt: number  // Date.now()
}

export interface QueuedWrite {
  id?: number
  spreadsheetId: string
  sheetName: string
  row: number           // 0-indexed (will convert to A1 notation on write)
  col: number           // 0-indexed
  oldValue: string
  newValue: string
  note?: string         // optional cell note to write after the value
  soldierName: string   // display name for the queue panel
  dateKey: string       // YYYY-MM-DD of the diary entry
  createdAt: number     // Date.now()
  attempts: number
  lastAttemptAt?: number
}

export interface ConflictRecord {
  id?: number
  spreadsheetId: string
  sheetName: string
  row: number
  col: number
  expectedOldValue: string
  actualRemoteValue: string
  ourNewValue: string
  detectedAt: number
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

export const db = new ArmyHrDb()
