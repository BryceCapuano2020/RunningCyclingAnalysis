/** How long an open may wait, for example behind another tab's upgrade, before the cache is given up on. */
const OPEN_TIMEOUT_MS = 5_000

/**
 * The cache database could not be opened. `nothingCached` is true only when storage is not there at
 * all (no IndexedDB, or opening it throws), so no recording can be kept in it and none needs removing.
 * It is false when the open errored, was blocked or timed out, since a database may exist that cannot
 * be read.
 */
export class WorkbenchOpenError extends Error {
  readonly nothingCached: boolean

  constructor(message: string, nothingCached: boolean) {
    super(message)
    this.name = 'WorkbenchOpenError'
    this.nothingCached = nothingCached
  }
}

/**
 * Opens a database, giving up when the open is blocked or takes too long, so that a stalled upgrade
 * cannot hold up an import or an account deletion. A connection that opens after the give-up is closed.
 */
export function openDatabase(
  name: string,
  version: number,
  upgrade: (request: IDBOpenDBRequest) => void,
  timeoutMs = OPEN_TIMEOUT_MS,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false
    const fail = (error: WorkbenchOpenError) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    }
    const timer = setTimeout(
      () => fail(new WorkbenchOpenError('Workbench storage took too long to open', false)),
      timeoutMs,
    )
    if (typeof indexedDB === 'undefined')
      return fail(new WorkbenchOpenError('Workbench storage is unavailable', true))
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(name, version)
    } catch {
      return fail(new WorkbenchOpenError('Workbench storage is unavailable', true))
    }
    request.onupgradeneeded = () => upgrade(request)
    request.onblocked = () =>
      fail(new WorkbenchOpenError('Workbench storage is blocked by another tab', false))
    request.onerror = () =>
      fail(new WorkbenchOpenError(request.error?.message ?? 'Workbench storage failed', false))
    request.onsuccess = () => {
      if (settled) return request.result.close()
      settled = true
      clearTimeout(timer)
      resolve(request.result)
    }
  })
}
