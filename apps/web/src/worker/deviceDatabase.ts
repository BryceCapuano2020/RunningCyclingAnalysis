import { OPEN_TIMEOUT_MS } from './openIndexedDb'

export const DB_NAME = 'rca-device-library'
export const STORE = 'digests'

export { OPEN_TIMEOUT_MS }

/** Errors that mean this browser offers no storage here (a private window, a sandbox), not that it failed. */
const NO_STORAGE_ERRORS = new Set(['InvalidStateError', 'SecurityError', 'NotSupportedError'])

/**
 * Why the database did not open. `unavailable` is storage the browser does not offer, so nothing could
 * have been kept there; `failed` is any other reason (full, blocked by another tab, hung), where kept
 * rows may exist, so a read must not report them as none.
 */
export class OpenFailure extends Error {
  readonly kind: 'unavailable' | 'failed'

  constructor(message: string, kind: 'unavailable' | 'failed') {
    super(message)
    this.kind = kind
  }
}

/** Opens the database, giving up after OPEN_TIMEOUT_MS or when another tab blocks it. */
export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(
      () => fail(new OpenFailure('Device storage did not open in time', 'failed')),
      OPEN_TIMEOUT_MS,
    )
    function fail(error: OpenFailure) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    }
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, 1)
    } catch (error) {
      fail(new OpenFailure(String(error), 'unavailable'))
      return
    }
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onblocked = () =>
      fail(new OpenFailure('Device storage is blocked by another tab', 'failed'))
    request.onerror = () => {
      const name = request.error?.name ?? ''
      fail(
        new OpenFailure(
          request.error?.message ?? 'Device storage failed',
          NO_STORAGE_ERRORS.has(name) ? 'unavailable' : 'failed',
        ),
      )
    }
    request.onsuccess = () => {
      // An open that was given up on and then succeeded holds a connection nobody will use.
      if (settled) request.result.close()
      else {
        settled = true
        clearTimeout(timer)
        resolve(request.result)
      }
    }
  })
}
