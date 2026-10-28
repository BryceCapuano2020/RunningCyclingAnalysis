import type { Page } from '@playwright/test'

/** The recording cache's database version and byte limit, as workbenchSchema.ts has them. */
export const CACHE_VERSION = 3
export const CACHE_BYTES = 64 * 1024 * 1024
export const CACHE_ENTRIES = 10_000
export const DAY_MS = 24 * 60 * 60 * 1000

/** One made-up recording's accounting row. The device scope holds them all. */
export interface SeededEntry {
  id: string
  startMs: number
  savedAt: number
  bytes: number
}

export interface CacheRow {
  activityId: string
  startMs: number
  bytes: number
}

/**
 * Replaces everything in the recording cache with these rows and a ledger that adds them up exactly.
 * The app must have opened the database already, as an import does. Open a page that holds no
 * connection first (`/privacy`), so the write is not behind the app's own.
 */
export async function seedCache(page: Page, rows: SeededEntry[]): Promise<void> {
  await page.evaluate(
    async ({ version, seeded }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('rca-workbench-evidence', version)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(['entries', 'traces', 'state'], 'readwrite')
          transaction.oncomplete = () => resolve()
          transaction.onabort = () => reject(transaction.error)
          transaction.objectStore('entries').clear()
          transaction.objectStore('traces').clear()
          for (const row of seeded) {
            transaction.objectStore('entries').put({
              key: JSON.stringify(['device', row.id]),
              scopeKey: 'device',
              activityId: row.id,
              startMs: row.startMs,
              savedAt: row.savedAt,
              bytes: row.bytes,
            })
          }
          transaction.objectStore('state').put({
            key: 'total',
            bytes: seeded.reduce((sum, row) => sum + row.bytes, 0),
            count: seeded.length,
          })
        })
      } finally {
        db.close()
      }
    },
    { version: CACHE_VERSION, seeded: rows },
  )
}

/** The cache's accounting rows, oldest activity first, and its ledger. */
export async function readCache(page: Page): Promise<{
  entries: CacheRow[]
  ledger: { bytes: number; count: number }
}> {
  const [entries, [ledger]] = await page.evaluate(async (version) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('rca-workbench-evidence', version)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const transaction = db.transaction(['entries', 'state'])
      const all = (store: string) =>
        new Promise<unknown[]>((resolve, reject) => {
          const request = transaction.objectStore(store).getAll()
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
      return await Promise.all([all('entries'), all('state')])
    } finally {
      db.close()
    }
  }, CACHE_VERSION)
  const rows = (entries as CacheRow[]).sort((a, b) => a.startMs - b.startMs)
  const { bytes, count } = ledger as { bytes: number; count: number }
  return { entries: rows, ledger: { bytes, count } }
}

/** What the ledger must say: the sum of the rows' bytes, and how many rows there are. */
export function exactLedger(entries: CacheRow[]): { bytes: number; count: number } {
  return { bytes: entries.reduce((sum, row) => sum + row.bytes, 0), count: entries.length }
}
