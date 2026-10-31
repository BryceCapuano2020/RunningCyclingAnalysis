import type { WorkerResponse } from '../../worker/protocol'
import { clearCountedRuns } from '../countedRunsStore'
import { clearKeptPower } from '../keptPowerStore'
import type { SavedActivity } from '../../worker/protocol'
import {
  deviceLibraryMarked,
  markPersistNoticeShown,
  persistNoticeShown,
  setDeviceLibraryMarked,
  setKeptLibraryHinted,
} from './keptLibrary'
import type { LibraryState } from './libraryState'
import type { Pending } from './model'
import { requestPersistence } from './storagePersistence'

/** The responses that answer a request, as opposed to ones the worker sends on its own. */
export type ReplyResponse = Exclude<
  WorkerResponse,
  {
    type:
      | 'started'
      | 'heartbeat'
      | 'progress'
      | 'outbox'
      | 'deviceOffer'
      | 'adoption'
      | 'missingOriginals'
      | 'detailCoverage'
      | 'libraryActivities'
      | 'deviceHolds'
      | 'libraryUnreadable'
      | 'accountIssue'
      | 'deviceIssue'
  }
>

/**
 * A library read that answers or fails ends the restoring state. The hint says whether this browser
 * has results to restore: a library read or a saved import sets it, a clear or an empty library clears it.
 * For the library kept in this browser it follows the list the worker reported from storage, not the
 * session, so a refused save or a refused clear leaves the hint as storage stands.
 */
export function rememberKeptLibrary(
  library: LibraryState,
  pending: Pending | undefined,
  message: ReplyResponse,
): void {
  if (pending?.kind === 'loadDevice' || pending?.kind === 'loadServer') library.setRestoring(false)
  if (pending === undefined || message.type !== 'state') return
  const kept = library.savedActivitiesRef.current.length > 0
  // A clear keeps the library kept in this browser unless it forgets it, as a signed-in clear does not.
  if (pending.kind === 'clear') {
    if (pending.forgetDevice === true) {
      setKeptLibraryHinted(kept)
      // The runs counted at walking pace and the rides whose power was kept go with the library, once it is known
      // to be gone: a refused clear leaves what remains, and the choices with it.
      if (!kept) {
        clearCountedRuns()
        clearKeptPower()
      }
    }
    return
  }
  // A sample on screen says nothing about the library kept in this browser.
  if (message.state.isSample) return
  if (pending.kind === 'loadServer') setKeptLibraryHinted(message.state.library.length > 0)
  else if (
    pending.kind === 'loadDevice' ||
    pending.kind === 'deleteDeviceActivity' ||
    pending.kind === 'keepProvisional' ||
    (pending.kind === 'addFiles' && pending.saveToDevice === true)
  ) {
    setKeptLibraryHinted(kept)
    if (kept && pending.kind === 'addFiles') askBrowserToKeep(library)
  }
}

/**
 * The list of the library kept in this browser, as the worker read it from storage, tells what the browser
 * should still hold: the mark follows every such list (an import, a removal, Remove all), so a library that
 * was there and reads empty is the browser's doing and no one else's. Rows it keeps but could not read (a
 * newer version's) are a library, so a list of none with some skipped is not a loss. The loss is told on the
 * library read that starts a visit, the one `during` is, once, and the mark goes with it.
 */
export function noteDeviceList(
  library: LibraryState,
  activities: readonly SavedActivity[],
  skipped: number,
  during: Pending | undefined,
): void {
  const holds = activities.length > 0 || skipped > 0
  if (during?.kind === 'loadDevice' && !holds && deviceLibraryMarked()) {
    library.setDeviceIssue((issue) => issue ?? { issue: 'evicted' })
  }
  setDeviceLibraryMarked(holds)
}

/**
 * Once results are kept in this browser, asks it to keep them (every time: a browser that agreed stays
 * agreed), and says so when it will not promise to, once on a device, since the same word on every import is
 * noise. The flag is set only when the notice was placed: another issue on screen is the more pressing word, and
 * this one waits for the next import.
 */
function askBrowserToKeep(library: LibraryState): void {
  void requestPersistence().then((persistence) => {
    if (persistence !== 'not-promised' || persistNoticeShown()) return
    if (library.deviceIssueRef.current !== null) return
    markPersistNoticeShown()
    library.setDeviceIssue({ issue: 'mayBeCleared' })
  })
}
