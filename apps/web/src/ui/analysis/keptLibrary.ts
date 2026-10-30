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

/**
 * Set on a device whose own library (the one a signed-out visitor keeps, never an account's) had results.
 * Where `rca.kept.v1` only speeds up a restore, this one says what the browser should still hold, so an
 * empty library after it is told as lost rather than shown as a fresh start. It lives in the same
 * storage the browser may clear, so it can only catch a library cleared on its own. A sweep of the whole
 * site (Safari's week away, "clear site data") takes this mark with the library, and then the next visit
 * looks like a first one: that loss cannot be told from here.
 */
const DEVICE_KEY = 'rca.deviceKept.v1'

/** Whether this browser's own library had results on an earlier visit. Refused storage counts as no. */
export function deviceLibraryMarked(): boolean {
  try {
    return localStorage.getItem(DEVICE_KEY) === '1'
  } catch {
    return false
  }
}

export function setDeviceLibraryMarked(kept: boolean): void {
  try {
    if (kept) localStorage.setItem(DEVICE_KEY, '1')
    else localStorage.removeItem(DEVICE_KEY)
  } catch {
    // Storage can be unavailable; a loss is then not told, as before.
  }
}

/** Set once the visitor has been told that the browser would not promise to keep their results. */
const PERSIST_NOTE_KEY = 'rca.persistNote.v1'

/** Whether this browser has been told already, so the same word is not said on every import. */
export function persistNoticeShown(): boolean {
  try {
    return localStorage.getItem(PERSIST_NOTE_KEY) === '1'
  } catch {
    return false
  }
}

export function markPersistNoticeShown(): void {
  try {
    localStorage.setItem(PERSIST_NOTE_KEY, '1')
  } catch {
    // Storage can be unavailable; the notice is then said again on the next import.
  }
}
