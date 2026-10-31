import { noteWork } from './workerWire'
import { listActivities } from '../api/client'
import { exportActivitiesJson, exportFooterJson, exportHeaderJson } from '../export/accountExport'
import type { WorkerRequest } from './protocol'

/**
 * Lists the account's library and writes its export as it goes, without the copies the analysis hides. Each page is written to the file
 * as soon as it arrives, so the library is never held as one text. The file is a Blob, so only its
 * parts, not one large string, cross back to the page. The listing costs one read.
 */
export async function exportAccount(
  request: Extract<WorkerRequest, { type: 'exportData' }>,
  /** Saved records that are copies the analysis hides: the export lists the shown copy of each workout. */
  hidden: ReadonlySet<string> = new Set(),
): Promise<Blob> {
  const parts: BlobPart[] = [
    exportHeaderJson({
      now: new Date(),
      account: request.account,
      profile: request.profile,
      measurements: request.measurements,
    }),
  ]
  let unreadable = 0
  let firstPage = true
  await listActivities(
    undefined,
    request.userId,
    (count) => {
      unreadable += count
    },
    (items) => {
      const text = exportActivitiesJson(items.filter(({ id }) => !hidden.has(id)))
      if (text === '') return
      if (!firstPage) parts.push(',')
      firstPage = false
      parts.push(new Blob([text]))
    },
    noteWork,
  )
  parts.push(exportFooterJson(unreadable))
  return new Blob(parts, { type: 'application/json' })
}
