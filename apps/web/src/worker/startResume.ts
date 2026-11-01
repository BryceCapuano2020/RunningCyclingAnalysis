import type { ActivityRecord } from '@rca/contract'
import type { AnalysisSession } from '@rca/core/session'
import { followUpAdopted } from './adoption'
import { keptTraceDropper } from './adoptionRequests'
import type { DeviceLibrary } from './deviceLibrary'
import type { FailedOriginals } from './failedOriginals'
import { openOutbox } from './outbox'
import { resumeOutbox } from './outboxResume'
import type { SendingKeys } from './sendingKeys'
import { resumeAsWriter } from './writerResume'
import type { Writing } from './writerResume'
import type { Workbench } from './workbench'

export interface ResumeParts {
  session: Pick<AnalysisSession, 'markSaved' | 'hiddenIds'>
  deviceLibrary: DeviceLibrary
  savedRecords: Map<string, ActivityRecord>
  /** Keys of saved activities whose original file is not in the library. */
  missingOriginals: Set<string>
  /** The originals whose upload failed for a passing reason and wait to be sent again. */
  failedOriginals: FailedOriginals
  sending: SendingKeys
  workbench: Pick<Workbench, 'remove'>
}

/**
 * Finishes the account's waiting saves, in the tab that holds its writer lock only: with two tabs open, one sends.
 * Used when a library loads and when the page asks again (the connection is back, or the athlete pressed Try again
 * now), so there is one sender. A save that ends takes its workout off the session's unsaved list, which is what
 * the page's "not fully saved" notice is made from. With `originals` (a retry the page asked for) the originals
 * whose upload failed are sent again after the rows, by the same sender.
 */
export function startResume(parts: ResumeParts, userId: string, originals = false): Writing {
  const { session, deviceLibrary, savedRecords, sending, workbench } = parts
  return resumeAsWriter(userId, () => {
    let cancelled = false
    const rows = resumeOutbox({
      userId,
      outbox: openOutbox(userId),
      savedRecords,
      sending,
      // Apart from any request: stamped with one, the page would drop it as late.
      post: (message) => self.postMessage(message),
      // Saves of kept activities that an Add began and a stop or a reload cut short finish here: the kept copy goes too.
      settled: async (row, outcome) => {
        await followUpAdopted(
          { library: deviceLibrary, savedRecords, adopted: keptTraceDropper(workbench) },
          row,
          outcome,
        )
        if (outcome === 'saved' || outcome === 'held') session.markSaved(row.key)
      },
    })
    return {
      cancel: () => {
        cancelled = true
        rows.cancel()
      },
      finished: rows.finished.then(async (result) => {
        if (!originals || cancelled) return result
        const stored = await parts.failedOriginals.retry({
          userId,
          savedRecords,
          missingOriginals: parts.missingOriginals,
          hiddenIds: () => session.hiddenIds(),
          cancelled: () => cancelled,
          post: (message) => self.postMessage(message),
        })
        for (const key of stored) session.markSaved(key)
        return result
      }),
    }
  })
}
