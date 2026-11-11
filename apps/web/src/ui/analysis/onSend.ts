import { useCallback } from 'react'
import type { WorkerRequest } from '../../worker/protocol'
import type { ImportManifestController } from './importManifestHook'
import type { SetError } from './model'
import { keepsError } from './quietRequests'

/** What sending a request clears or begins on the page. */
interface SendDeps {
  refreshBusy: () => void
  beginManifest: ImportManifestController['begin']
  resetNoticesFor: (request: WorkerRequest) => void
  setError: SetError
  setImportOutcome: (outcome: null) => void
  setLibraryError: (error: null) => void
  setLibraryNotice: (notice: null) => void
}

/** The notices a request replaces are cleared as it is sent. */
export function useOnSend({
  refreshBusy,
  beginManifest,
  resetNoticesFor,
  setError,
  setImportOutcome,
  setLibraryError,
  setLibraryNotice,
}: SendDeps) {
  return useCallback(
    (request: WorkerRequest, requestId: number) => {
      refreshBusy()
      // An import into a library is recorded from the moment it is sent. The analysis made while the account
      // loads is not: it is sent again once the account is known.
      if (request.type === 'addFiles' && request.provisional !== true) {
        beginManifest(
          requestId,
          request.files,
          request.sync === null ? 'device' : `account:${request.sync.userId}`,
        )
      }
      if (!keepsError(request)) setError(null)
      // A new import or rebuild replaces the outcome of the last library change, and so does the sample or a
      // clear, which leave nothing for that outcome to be about: the landing page would say it unprompted.
      if (
        request.type === 'addFiles' ||
        request.type === 'rebuildStale' ||
        request.type === 'loadSample' ||
        request.type === 'clear'
      ) {
        setLibraryNotice(null)
        setLibraryError(null)
      }
      resetNoticesFor(request)
      // The summary describes the last import only: another import, a clear, the sample or a delete
      // replaces it, since a delete changes the count the summary gave.
      if (
        request.type === 'addFiles' ||
        request.type === 'clear' ||
        request.type === 'loadSample' ||
        request.type === 'deleteActivity' ||
        request.type === 'deleteDeviceActivity'
      ) {
        setImportOutcome(null)
      }
    },
    [
      beginManifest,
      refreshBusy,
      resetNoticesFor,
      setError,
      setImportOutcome,
      setLibraryError,
      setLibraryNotice,
    ],
  )
}
