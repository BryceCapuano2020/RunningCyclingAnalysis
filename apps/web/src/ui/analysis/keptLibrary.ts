/**
 * Set on a device whose kept library had results, so a reload can show a restoring state at once,
 * before the account or the kept library is known. A per-viewer convenience only: it never decides
 * what the library holds.
 */
const KEY = 'rca.kept.v1'

/** Whether this browser kept results on an earlier visit. Refused storage counts as no. */
export function keptLibraryHinted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setKeptLibraryHinted(kept: boolean): void {
  try {
    if (kept) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    // Storage can be unavailable; the next reload then shows the landing page until the library loads.
  }
}
