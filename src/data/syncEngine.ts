import { markAttempted, removeWrite } from './writeQueue'
import { updateCell, readCell } from './sheetsClient'
import { db } from './db'

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline'

export interface SyncState {
  status: SyncStatus
  pendingCount: number
  lastSyncAt: number | null
  lastError: string | null
}

type SyncListener = (state: SyncState) => void

let currentState: SyncState = {
  status: 'idle',
  pendingCount: 0,
  lastSyncAt: null,
  lastError: null,
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

let syncInterval: ReturnType<typeof setInterval> | null = null
let tokenProvider: (() => string | null) | null = null

export function initSyncEngine(getToken: () => string | null) {
  tokenProvider = getToken

  const runSync = () => drainQueue().catch(console.error)

  window.addEventListener('online', runSync)
  window.addEventListener('focus', runSync)
  syncInterval = setInterval(runSync, 30_000)

  // Cleanup exported
  return () => {
    window.removeEventListener('online', runSync)
    window.removeEventListener('focus', runSync)
    if (syncInterval !== null) clearInterval(syncInterval)
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
  if (allWrites.length === 0) {
    emit({ status: 'idle', pendingCount: 0, lastError: null })
    return
  }

  emit({ status: 'syncing', pendingCount: allWrites.length })

  // Group by spreadsheetId
  const bySheet = new Map<string, typeof allWrites>()
  for (const w of allWrites) {
    const key = w.spreadsheetId
    bySheet.set(key, [...(bySheet.get(key) ?? []), w])
  }

  let errors = 0

  for (const [, writes] of bySheet) {
    for (const write of writes) {
      try {
        // Conflict check: read remote value before writing
        const remoteValue = await readCell(token, write.spreadsheetId, write.sheetName, write.row, write.col)
        if (remoteValue !== write.oldValue && remoteValue !== write.newValue) {
          // Conflict: remote value differs from what we expected
          await db.conflicts.add({
            spreadsheetId: write.spreadsheetId,
            sheetName: write.sheetName,
            row: write.row,
            col: write.col,
            expectedOldValue: write.oldValue,
            actualRemoteValue: remoteValue,
            ourNewValue: write.newValue,
            detectedAt: Date.now(),
          })
          // Skip this write to preserve remote value (don't silently overwrite)
          await removeWrite(write.id!)
          continue
        }

        await updateCell(token, {
          spreadsheetId: write.spreadsheetId,
          sheetName: write.sheetName,
          row: write.row,
          col: write.col,
          value: write.newValue,
        })

        await removeWrite(write.id!)
      } catch (err) {
        errors++
        await markAttempted(write.id!)
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
