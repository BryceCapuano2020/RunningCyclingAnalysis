/**
 * Whether the browser agreed to keep this site's storage, which holds a signed-out visitor's results.
 * Without the agreement a browser may clear it when space runs short, and Safari clears it after a week
 * without a visit. 'unknown' is a browser that cannot say, which is never reported as a problem.
 */
export type Persistence = 'kept' | 'not-promised' | 'unknown'

/**
 * Asks the browser to keep this site's storage, once a first import has been kept in it. A browser that
 * already agreed is not asked again, and one that refuses or errors is reported, not retried here.
 */
export async function requestPersistence(): Promise<Persistence> {
  try {
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
    if (storage === undefined || typeof storage.persist !== 'function') return 'unknown'
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return 'kept'
    return (await storage.persist()) ? 'kept' : 'not-promised'
  } catch {
    return 'unknown'
  }
}
