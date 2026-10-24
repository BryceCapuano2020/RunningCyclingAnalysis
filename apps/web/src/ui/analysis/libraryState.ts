import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { SavedActivity } from '../../worker/protocol'
import { keptLibraryHinted } from './keptLibrary'
import type { LibraryStatus } from './model'

/**
 * The signed-in library: its load status, the imports held while it loads, and the notices the
 * page shows about it. The values are returned as they are; the actions are in libraryActions.ts.
 */
export function useLibraryState() {
  const [libraryStatus, setLibraryStatus] = useState<LibraryStatus>('idle')
  const libraryStatusRef = useRef<LibraryStatus>('idle')
  // Signed-in imports wait here until the library has loaded. Otherwise a failed load followed by
  // an import would replace the whole library with only the new files.
  const libraryWaitRef = useRef<File[][]>([])
  // A reload of a visit that kept results restores them until the library has been read.
  const [restoring, setRestoring] = useState(keptLibraryHinted)
  const [libraryAction, setLibraryAction] = useState<'deleting' | null>(null)
  const [libraryNotice, setLibraryNotice] = useState<string | null>(null)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [missingOriginals, setMissingOriginals] = useState(0)
  const [libraryUnreadable, setLibraryUnreadable] = useState(0)
  const [savedActivities, setSavedActivities] = useState<SavedActivity[]>([])
  const savedActivitiesRef = useRef<SavedActivity[]>([])

  useLayoutEffect(() => {
    savedActivitiesRef.current = savedActivities
  }, [savedActivities])

  const setLibrary = useCallback((next: LibraryStatus) => {
    libraryStatusRef.current = next
    setLibraryStatus(next)
  }, [])

  return {
    libraryStatus,
    libraryStatusRef,
    setLibrary,
    libraryWaitRef,
    restoring,
    setRestoring,
    libraryAction,
    setLibraryAction,
    libraryNotice,
    setLibraryNotice,
    libraryError,
    setLibraryError,
    missingOriginals,
    setMissingOriginals,
    libraryUnreadable,
    setLibraryUnreadable,
    savedActivities,
    savedActivitiesRef,
    setSavedActivities,
  }
}

export type LibraryState = ReturnType<typeof useLibraryState>
