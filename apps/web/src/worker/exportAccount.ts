import { noteWork } from './workerWire'
import { listActivities } from '../api/client'
import { createLiftTransport } from '../api/lifts'
import {
  EXPORT_LIFTS_END_JSON,
  exportActivitiesJson,
  exportFooterJson,
  exportHeaderJson,
  exportLiftsJson,
} from '../export/accountExport'
import type { WorkerRequest } from './protocol'

/**
 * Lists the account's library and writes its export as it goes, without the copies the analysis hides. Each page is written to the file
 * as soon as it arrives, so the library is never held as one text. The file is a Blob, so only its
 * parts, not one large string, cross back to the page. The listing costs one read.
 * The lifts come first, page by page from the server, and a page that fails fails the export.
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
  await writeLifts(parts, request.userId)
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

/** The account holds at most 60,000 sets, 1,000 to a page; more pages than this means the cursor loops. */
const MAX_LIFT_PAGES = 60

/** Reads every lift page and adds it to the file, then closes the lift list and opens the activities. */
async function writeLifts(parts: BlobPart[], userId: string | undefined): Promise<void> {
  const transport = createLiftTransport(userId)
  let cursor: string | null = null
  let wrote = false
  for (let pages = 0; ; pages++) {
    if (pages === MAX_LIFT_PAGES) throw new Error('The lift list did not end')
    const answer = await transport.page(cursor)
    if (answer.items.length > 0) {
      parts.push(new Blob([`${wrote ? ',' : ''}${exportLiftsJson(answer.items)}`]))
      wrote = true
    }
    cursor = answer.next
    if (cursor === null) break
  }
  parts.push(EXPORT_LIFTS_END_JSON)
}
