import type { ActivityRecord } from '@rca/contract'
import type { AnalysisSession } from '@rca/core/session'
import { followUpAdopted } from './adoption'
import { keptTraceDropper } from './adoptionRequests'
import type { DeviceLibrary } from './deviceLibrary'
import { openOutbox } from './outbox'
import { resumeOutbox } from './outboxResume'
import type { SendingKeys } from './sendingKeys'
import { resumeAsWriter } from './writerResume'
import type { Writing } from './writerResume'
import type { Workbench } from './workbench'

export interface ResumeParts {
  session: Pick<AnalysisSession, 'markSaved'>
  deviceLibrary: DeviceLibrary
  savedRecords: Map<string, ActivityRecord>
  sending: SendingKeys
  workbench: Pick<Workbench, 'remove'>
}

/**
 * Finishes the account's waiting saves, in the tab that holds its writer lock only: with two tabs open, one sends.
 * Used when a library loads and when the page asks again (the connection is back, or the athlete pressed Try again
 * now), so there is one sender. A save that ends takes its workout off the session's unsaved list, which is what
 * the page's "not fully saved" notice is made from.
 */
export function startResume(parts: ResumeParts, userId: string): Writing {
  const { session, deviceLibrary, savedRecords, sending, workbench } = parts
  return resumeAsWriter(userId, () =>
    resumeOutbox({
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
    }),
  )
}
