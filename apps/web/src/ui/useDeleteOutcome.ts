import { useState } from 'react'

/** How one removal ended: the library's notice when it worked, its error when it did not. */
export interface DeleteOutcome {
  failed: boolean
  text: string
}

/**
 * Tracks one removal from the library, where the removal was asked for. Beginning one clears the last
 * outcome, and the library clears its notice and error in the same step, so the first notice or error
 * after that is this removal's. A page shows the outcome beside the activity it asked about.
 */
export function useDeleteOutcome(
  libraryNotice: string | null,
  libraryError: string | null,
  /** A removal whose outcome is already in the library, which a page arrives announcing. */
  announcing = false,
) {
  const [awaiting, setAwaiting] = useState(announcing)
  const [outcome, setOutcome] = useState<DeleteOutcome | null>(null)
  const settled: DeleteOutcome | null =
    libraryError !== null
      ? { failed: true, text: libraryError }
      : libraryNotice !== null
        ? { failed: false, text: libraryNotice }
        : null
  if (awaiting && settled !== null) {
    setOutcome(settled)
    setAwaiting(false)
  }
  return {
    begin: () => {
      setOutcome(null)
      setAwaiting(true)
    },
    /** Drops the outcome shown, such as when the list it was shown on changes. */
    clear: () => setOutcome(null),
    outcome,
  }
}
