import { db } from './db'
import type { QueuedWrite } from './db'

export async function enqueueWrite(
  write: Omit<QueuedWrite, 'id' | 'attempts' | 'createdAt'>,
): Promise<void> {
  await db.writeQueue.add({ ...write, createdAt: Date.now(), attempts: 0 })
}

export async function getPendingWrites(spreadsheetId: string): Promise<QueuedWrite[]> {
  return db.writeQueue
    .where('spreadsheetId')
    .equals(spreadsheetId)
    .sortBy('createdAt')
}

export async function markAttempted(id: number): Promise<void> {
  await db.writeQueue.update(id, {
    attempts: ((await db.writeQueue.get(id))?.attempts ?? 0) + 1,
    lastAttemptAt: Date.now(),
  })
}

export async function removeWrite(id: number): Promise<void> {
  await db.writeQueue.delete(id)
}

export async function getPendingCount(spreadsheetId: string): Promise<number> {
  return db.writeQueue.where('spreadsheetId').equals(spreadsheetId).count()
}

export async function getAllPendingCount(): Promise<number> {
  return db.writeQueue.count()
}
