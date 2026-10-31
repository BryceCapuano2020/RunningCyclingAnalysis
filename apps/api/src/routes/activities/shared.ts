import { and, eq, getTableColumns } from 'drizzle-orm'
import { StoredActivityDigestSchema, type ActivityRecord } from '@rca/contract'
import type { Db } from '../../env.ts'
import { HttpError } from '../../errors.ts'
import { activities } from '../../db/schema.ts'

export type ActivityRow = typeof activities.$inferSelect

/** Every activities column, aliased to its ActivityRow key, for a raw statement's RETURNING. */
export const ACTIVITY_COLUMNS = Object.entries(getTableColumns(activities))
  .map(([key, column]) => `${column.name} AS ${key}`)
  .join(', ')

/** Every field of a record except its digest. */
export type ActivityEnvelope = Omit<ActivityRecord, 'digest'>

export function toEnvelope(row: ActivityRow): ActivityEnvelope {
  return {
    id: row.id,
    fileName: row.fileName,
    hasFile: row.fileKey !== null,
    // A pending reservation counts toward quota internally, but is not a stored file yet.
    fileSize: row.fileKey === null ? null : row.fileSize,
    createdAt: row.createdAt,
  }
}

export function toRecord(
  row: ActivityRow,
  digest: ActivityRecord['digest'] = StoredActivityDigestSchema.parse(JSON.parse(row.digestJson)),
): ActivityRecord {
  return { ...toEnvelope(row), digest }
}

/**
 * The record of a row for a request that holds a digest of its own: when the stored digest cannot be
 * read (a row a bound has since refused, or one a build wrote that this one cannot), the record
 * carries the digest the request sent, which was checked, and not a failure the athlete cannot act on.
 */
export function toRecordHolding(row: ActivityRow, held: ActivityRecord['digest']): ActivityRecord {
  try {
    const stored = StoredActivityDigestSchema.safeParse(JSON.parse(row.digestJson))
    return toRecord(row, stored.success ? stored.data : held)
  } catch {
    return toRecord(row, held)
  }
}

/** Looks up an activity owned by the user. Other users' activities read as not found. */
export async function findOwnedActivity(db: Db, userId: string, id: string): Promise<ActivityRow> {
  const row = await db
    .select()
    .from(activities)
    .where(and(eq(activities.id, id), eq(activities.userId, userId)))
    .get()
  if (!row) throw new HttpError(404, 'not_found', 'Activity not found')
  return row
}

/** Original-file storage is absent from this deployment, so no file can be stored or read. */
export function fileStorageUnavailable(): HttpError {
  return new HttpError(
    503,
    'file_storage_unavailable',
    'Original-file storage is not available in this deployment',
  )
}
