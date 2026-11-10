const KEY = 'rca.deviceOffer.dismissed.v1'

type Dismissed = Record<string, number | string>

function read(): Dismissed {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return typeof parsed === 'object' && parsed !== null ? (parsed as Dismissed) : {}
  } catch {
    return {}
  }
}

/** What the offer held: the activities and the lifting sets, which differ even when their sum does not. */
export const offerKey = (activities: number, lifts: number) => `${activities}:${lifts}`

/**
 * What the account's holder said "Not now" to (see `offerKey`), so the offer does not ask again for the same
 * contents. Different contents (more were kept since) ask again. A count saved before lifting sets counted
 * activities only. A convenience of this browser: where storage is refused, the offer is simply made each visit.
 */
export function dismissedOffer(userId: string): string | null {
  const kept = read()[userId]
  if (typeof kept === 'number') return offerKey(kept, 0)
  return typeof kept === 'string' ? kept : null
}

export function dismissOffer(userId: string, key: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [userId]: key }))
  } catch {
    // The offer comes back next visit.
  }
}
