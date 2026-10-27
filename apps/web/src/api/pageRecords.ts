import { StoredActivityDigestSchema } from '@rca/contract'
import type { ActivityPageWire, ActivityRecord } from '@rca/contract'

/**
 * The records of a page whose digest passes the stored-digest schema, and how many did not. The
 * server only checks that a digest is JSON, so this is where a stored digest from an old or damaged
 * row is found. It is left out and counted, the way the server counts a digest it cannot parse,
 * and the rest of the page loads.
 */
export function readableRecords(items: ActivityPageWire['items']): {
  records: ActivityRecord[]
  unreadable: number
} {
  const records: ActivityRecord[] = []
  for (const item of items) {
    const digest = StoredActivityDigestSchema.safeParse(item.digest)
    if (digest.success) records.push({ ...item, digest: digest.data })
  }
  return { records, unreadable: items.length - records.length }
}
