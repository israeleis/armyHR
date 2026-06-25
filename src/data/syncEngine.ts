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
