const STORAGE_KEY = 'rca.aboutDataSeen'

/** The notes a visitor has been shown, by stable id, with the count each one said. */
export type SeenNotes = Readonly<Record<string, number>>

export function readSeenNotes(): SeenNotes {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number',
      ),
    )
  } catch {
    return {}
  }
}

export function writeSeenNotes(seen: SeenNotes): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seen))
  } catch {
    // The notes then show on every visit, which is the safe way to fail.
  }
}

/** Forgets what was shown, with the rest of what this browser keeps about the visitor's data. */
export function forgetSeenNotes(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing was kept that could be removed.
  }
}
