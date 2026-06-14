import { markAttempted, removeWrite } from './writeQueue'
import { updateCell, getSheetIdByName, updateCellNote } from './sheetsClient'
import { db } from './db'
import { getSnapshot } from './localCache'

const MAX_ATTEMPTS = 5

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
        // Max-attempts guard: permanently fail writes that have exceeded the retry cap
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
          continue
        }

        // Snapshot-based conflict detection (avoids extra API round-trip)
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
            continue
          }
        }

        await updateCell(token, {
          spreadsheetId: write.spreadsheetId,
          sheetName: write.sheetName,
          row: write.row,
          col: write.col,
          value: write.newValue,
        })

        // Write cell note if supplied (non-fatal — don't retry on failure)
        if (write.note) {
          try {
            const sheetId = await getSheetIdByName(token, write.spreadsheetId, write.sheetName)
            if (sheetId !== null) {
              await updateCellNote(token, write.spreadsheetId, sheetId, write.row, write.col, write.note)
            }
          } catch (noteErr) {
            console.warn('Cell note write failed (non-fatal):', noteErr)
          }
        }

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
