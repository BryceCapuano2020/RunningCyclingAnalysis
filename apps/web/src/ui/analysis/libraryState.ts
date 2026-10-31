import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DeviceIssue, SavedActivity, WorkerRequest } from '../../worker/protocol'
import { hasRemovedMark } from '../activitiesView'
import { keptLibraryHinted } from './keptLibrary'
import type { DetailCoverage, LibraryStatus, OutboxStatus } from './model'

/**
 * Whether a request writes to the library kept in this browser again, so a refusal reported earlier no
 * longer stands. The worker reports a new one before the request's reply if the attempt fails too. A
 * read does not: the library the sign-out loads is where a copy that could not be deleted shows.
 */
function retriesDevice(request: WorkerRequest): boolean {
  return (
    (request.type === 'addFiles' && request.saveToDevice === true) ||
    request.type === 'deleteDeviceActivity' ||
    request.type === 'keepProvisional' ||
    (request.type === 'clear' && request.forgetDevice === true)
  )
}

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
  const [detail, setDetail] = useState<DetailCoverage | null>(null)
  const [outdatedWithOriginal, setOutdatedWithOriginal] = useState(0)
  const [libraryUnreadable, setLibraryUnreadable] = useState(0)
  const [outbox, setOutbox] = useState<OutboxStatus | null>(null)
  const [deviceIssue, setDeviceIssueState] = useState<DeviceIssue | null>(null)
  // The issue on screen, current the moment it is set, so a notice that waits for a free place can ask.
  const deviceIssueRef = useRef<DeviceIssue | null>(null)
  const setDeviceIssue = useCallback(
    (next: DeviceIssue | null | ((previous: DeviceIssue | null) => DeviceIssue | null)) => {
      const value = typeof next === 'function' ? next(deviceIssueRef.current) : next
      deviceIssueRef.current = value
      setDeviceIssueState(value)
    },
    [],
  )
  const [savedActivities, setSavedActivities] = useState<SavedActivity[]>([])
  const savedActivitiesRef = useRef<SavedActivity[]>([])

  useLayoutEffect(() => {
    savedActivitiesRef.current = savedActivities
  }, [savedActivities])

  // A removal's notice or error belongs to the page it was made on. Moving to another page clears it, so
  // Profile does not show an old "Deleted ..."; a move to the list with the removal's marker keeps it, for
  // the list to announce.
  useEffect(() => {
    const leaving = () => {
      if (hasRemovedMark(window.location.hash)) return
      setLibraryNotice(null)
      setLibraryError(null)
    }
    window.addEventListener('hashchange', leaving)
    return () => window.removeEventListener('hashchange', leaving)
  }, [])

  const setLibrary = useCallback((next: LibraryStatus) => {
    libraryStatusRef.current = next
    setLibraryStatus(next)
  }, [])

  /**
   * Drops the news of imports that no longer show, which an account change or the sample replaces. A
   * refusal to delete is about what this browser still holds, which outlives both, so it stays.
   */
  const dropNotSaved = useCallback(
    () => setDeviceIssue((issue) => (issue?.issue === 'notSaved' ? null : issue)),
    [setDeviceIssue],
  )

  /** Clears what a request replaces: an unreadable count a library load reports afresh, and a refusal it retries. */
  const resetNoticesFor = useCallback(
    (request: WorkerRequest) => {
      if (request.type === 'loadServer' || request.type === 'rebuildStale') setLibraryUnreadable(0)
      // A sample, another library or a clear is another scope, so what was held for the last no longer stands.
      if (
        request.type === 'loadSample' ||
        request.type === 'loadServer' ||
        request.type === 'loadDevice' ||
        request.type === 'clear'
      )
        setDetail(null)
      if (request.type === 'loadSample' || request.type === 'loadDevice') dropNotSaved()
      if (retriesDevice(request)) setDeviceIssue(null)
      // Another import replaces the account of the last visit's saves.
      if (request.type === 'addFiles') setOutbox(null)
    },
    [dropNotSaved, setDeviceIssue],
  )

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
    detail,
    setDetail,
    outdatedWithOriginal,
    setOutdatedWithOriginal,
    libraryUnreadable,
    setLibraryUnreadable,
    deviceIssue,
    outbox,
    setOutbox,
    deviceIssueRef,
    setDeviceIssue,
    dropNotSaved,
    resetNoticesFor,
    savedActivities,
    savedActivitiesRef,
    setSavedActivities,
  }
}

export type LibraryState = ReturnType<typeof useLibraryState>
