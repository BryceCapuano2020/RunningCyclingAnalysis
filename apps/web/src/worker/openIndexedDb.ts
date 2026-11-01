/** How long an open may take before it is given up as failed, so a hung one does not hold the queue. */
export const OPEN_TIMEOUT_MS = 10_000

/**
 * Opens a database, or resolves null when storage is missing, refuses, is blocked by another tab or does not answer
 * within `timeoutMs`. Never rejects. An open that answers after it was given up on is closed, since nobody will use it.
 */
export function openIndexedDb(
  name: string,
  upgrade: (db: IDBDatabase) => void,
  timeoutMs = OPEN_TIMEOUT_MS,
): Promise<IDBDatabase | null> {
  return new Promise<IDBDatabase | null>((resolve) => {
    let settled = false
    const timer = setTimeout(() => settle(null), timeoutMs)
    function settle(db: IDBDatabase | null) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(db)
    }
    try {
      const request = indexedDB.open(name, 1)
      request.onupgradeneeded = () => upgrade(request.result)
      request.onsuccess = () => {
        if (settled) request.result.close()
        else settle(request.result)
      }
      request.onerror = () => settle(null)
      request.onblocked = () => settle(null)
    } catch {
      settle(null)
    }
  })
}
