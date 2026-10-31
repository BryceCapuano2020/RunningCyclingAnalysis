const KEY = 'rca.deviceOffer.dismissed.v1'

type Dismissed = Record<string, number>

function read(): Dismissed {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return typeof parsed === 'object' && parsed !== null ? (parsed as Dismissed) : {}
  } catch {
    return {}
  }
}

/**
 * How many kept activities the account's holder said "Not now" to, so the offer does not ask again for the same
 * number. A different number (more were kept since) asks again. A convenience of this browser: where storage is
 * refused, the offer is simply made each visit.
 */
export function dismissedOfferCount(userId: string): number | null {
  const count = read()[userId]
  return typeof count === 'number' ? count : null
}

export function dismissOffer(userId: string, count: number): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [userId]: count }))
  } catch {
    // The offer comes back next visit.
  }
}
