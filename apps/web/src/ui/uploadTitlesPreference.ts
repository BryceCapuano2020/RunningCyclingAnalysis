/**
 * The athlete's choice to send the titles of their activities to their library (D12 E7, RCA-032), kept on this device
 * for the account that made it, so a second person on a shared device does not send titles on someone else's choice.
 * Off unless chosen. The worker is told with the requests that save (api/uploadPolicy.ts).
 */

/** Where the choice is kept. Exported so the privacy page's tests read the same key. */
export const UPLOAD_TITLES_KEY = 'rca.uploadTitles.v1'

const keyOf = (userId: string): string => `${UPLOAD_TITLES_KEY}.${userId}`

/**
 * What this account chose from this device: true or false once it has chosen, undefined before (or when storage cannot
 * be read). Nothing chosen is nothing sent to the worker, which then sends no titles.
 */
export function storedUploadTitles(userId: string): boolean | undefined {
  try {
    const kept = localStorage.getItem(keyOf(userId))
    return kept === '1' ? true : kept === '0' ? false : undefined
  } catch {
    return undefined
  }
}

/** The request field for the choice: present once the account has chosen. */
export function uploadTitlesField(userId: string): { uploadTitles?: boolean } {
  const chosen = storedUploadTitles(userId)
  return chosen === undefined ? {} : { uploadTitles: chosen }
}

/** Keeps the choice. A refused store is not an error: the choice then lasts until the page closes. */
export function saveUploadTitles(userId: string, on: boolean): void {
  try {
    localStorage.setItem(keyOf(userId), on ? '1' : '0')
  } catch {
    // Storage can be unavailable (private windows).
  }
}
