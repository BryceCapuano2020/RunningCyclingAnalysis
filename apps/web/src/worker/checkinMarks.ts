import type { Marks } from '@rca/core/lookback'
import { CHECKIN_DB, epochKey, openCheckinDb } from './checkinStore'
import type { CheckinScope } from './checkinStore'
import { databaseExists } from './workbenchExists'

/**
 * What the `marks` and `seen` stores of `rca-checkin` hold for one scope, and how it is read and written. Every
 * write carries the epoch read with it: `clearCheckinScope` bumps the epoch in the same transaction that clears the
 * scope, and a write made under an older epoch is refused inside its own transaction, so a tab that was mid-import
 * when Remove all ran cannot bring a baseline back. Everything here is best effort: storage that refuses is no record.
 */

/** The marks of a scope, and when its library was last rebuilt (a baseline from before that is not used). */
export interface StoredMarks extends Marks {
  rebuiltAtMs?: number
}

/** What the athlete has seen of each row, so a row that has been seen stops taking the first place. */
export interface SeenRecord {
  v: 1
  lookBack: {
    impressions: number
    lastAtMs: number | null
    openedAtMs: number | null
    hiddenAtMs: number | null
  }
  /** `forBaselineAtMs` says which baseline the counts are of: a new baseline starts them again. */
  checkIn: {
    forBaselineAtMs: number | null
    impressions: number
    openedAtMs: number | null
    hiddenAtMs: number | null
  }
}

export const NO_SEEN: SeenRecord = {
  v: 1,
  lookBack: { impressions: 0, lastAtMs: null, openedAtMs: null, hiddenAtMs: null },
  checkIn: { forBaselineAtMs: null, impressions: 0, openedAtMs: null, hiddenAtMs: null },
}

/** Everything stored for a scope, with the epoch it was read under. */
export interface ScopeRecords {
  marks: StoredMarks | null
  seen: SeenRecord
  epoch: number
}

function request<T>(r: IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => resolve(undefined)
  })
}

const isMarks = (value: unknown): value is StoredMarks =>
  typeof value === 'object' && value !== null && (value as StoredMarks).v === 1
const isSeen = (value: unknown): value is SeenRecord =>
  typeof value === 'object' &&
  value !== null &&
  (value as SeenRecord).v === 1 &&
  typeof (value as SeenRecord).lookBack === 'object' &&
  typeof (value as SeenRecord).checkIn === 'object'

/**
 * The scope's records, or null when storage cannot say. A browser with no database yet answers with empty records
 * and epoch 0, and is not given a database by being asked.
 */
export async function readScope(scope: CheckinScope): Promise<ScopeRecords | null> {
  if (typeof indexedDB === 'undefined') return null
  if (!(await databaseExists(CHECKIN_DB))) return { marks: null, seen: NO_SEEN, epoch: 0 }
  const db = await openCheckinDb()
  if (db === null) return null
  try {
    const tx = db.transaction(['marks', 'seen'], 'readonly')
    const [marks, epoch, seen] = await Promise.all([
      request(tx.objectStore('marks').get(scope)),
      request(tx.objectStore('marks').get(epochKey(scope))),
      request(tx.objectStore('seen').get(scope)),
    ])
    return {
      marks: isMarks(marks) ? marks : null,
      seen: isSeen(seen) ? seen : NO_SEEN,
      epoch: typeof epoch === 'number' ? epoch : 0,
    }
  } catch {
    return null
  }
}

export type WriteResult = 'written' | 'replaced' | 'refused'

/**
 * Writes the marks and/or the seen record of a scope, only if its epoch is still `epoch`. 'replaced' says the scope
 * was cleared since the epoch was read; 'refused' says storage would not take it.
 */
export async function writeScope(
  scope: CheckinScope,
  epoch: number,
  records: { marks?: StoredMarks; seen?: SeenRecord },
): Promise<WriteResult> {
  const db = await openCheckinDb()
  if (db === null) return 'refused'
  try {
    const tx = db.transaction(['marks', 'seen'], 'readwrite')
    const marks = tx.objectStore('marks')
    let replaced = false
    const current = marks.get(epochKey(scope))
    current.onsuccess = () => {
      const now = typeof current.result === 'number' ? current.result : 0
      if (now !== epoch) {
        replaced = true
        tx.abort()
        return
      }
      if (records.marks !== undefined) marks.put(records.marks, scope)
      if (records.seen !== undefined) tx.objectStore('seen').put(records.seen, scope)
    }
    return await new Promise<WriteResult>((resolve) => {
      tx.oncomplete = () => resolve('written')
      tx.onerror = () => resolve(replaced ? 'replaced' : 'refused')
      tx.onabort = () => resolve(replaced ? 'replaced' : 'refused')
    })
  } catch {
    return 'refused'
  }
}
