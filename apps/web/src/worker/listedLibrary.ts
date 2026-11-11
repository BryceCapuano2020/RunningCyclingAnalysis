import type { ActivityRecord } from '@rca/contract'
import type { AnalysisSession } from '@rca/core/session'
import { workoutKeyOf } from './device'

/**
 * Puts the session's index on the library as the account lists it. The records that hold their original file are named, so an
 * activity whose original was refused keeps its notice until the file is held, though its digest is listed.
 */
export function replaceFromAccount(
  session: AnalysisSession,
  records: readonly ActivityRecord[],
): void {
  session.replaceLibrary(
    records.map((record) => record.digest),
    {
      fromServer: true,
      withFile: new Set(
        records.filter((record) => record.hasFile).map((record) => workoutKeyOf(record.digest)),
      ),
    },
  )
}
