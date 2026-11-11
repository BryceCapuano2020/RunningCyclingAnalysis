import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import type { z } from 'zod'
import { workoutKey } from '@rca/core/duplicates'
import { ActivityCreateSchema, MAX_DIGEST_BYTES, type ActivityRecord } from '@rca/contract'
import type { Bindings, Db } from '../../env.ts'
import type { Deps } from '../../deps.ts'
import { HttpError } from '../../errors.ts'
import { activities, schema } from '../../db/schema.ts'
import { databaseSoftLimitBytes } from '../../databaseGuard.ts'
import { checkDigestText } from './digestText.ts'
import type { ActivityRow } from './shared.ts'

/**
 * What saving a digest reads and writes, without a request: the create route builds it from its context, and a queue
 * consumer (Garmin's ingest, docs/design/garmin-sync.md decision 6) builds it from its bindings.
 */
export interface SaveContext {
  DB: D1Database
  db: Db
  deps: Pick<Deps, 'now' | 'randomUUID'>
  /** The database size past which a growing write is refused (databaseGuard.ts). */
  databaseLimit: number
}

export function saveContext(
  env: Pick<Bindings, 'DB' | 'DATABASE_SOFT_LIMIT_MIB'>,
  deps: Pick<Deps, 'now' | 'randomUUID'>,
  db: Db = drizzle(env.DB, { schema }),
): SaveContext {
  return { DB: env.DB, db, deps, databaseLimit: databaseSoftLimitBytes(env) }
}

/** A saved activity: 201 when a row was inserted, 200 when one already held it (upgraded or not). */
export interface Saved {
  status: 200 | 201
  record: ActivityRecord
}

/** A validated create body, with the values every path below derives from it. */
export type CreateInput = z.infer<typeof ActivityCreateSchema> & {
  digestJson: string
  digestBytes: number
  dedupeKey: string
}

export const CONFLICTING_FILE_MESSAGE =
  'This activity already exists with different original file contents'

/** A stored digest's size: UTF-8 bytes, as SQLite's length(CAST(digest_json AS BLOB)) counts them. */
export function digestByteLength(digestJson: string): number {
  return new TextEncoder().encode(digestJson).byteLength
}

export function digestTooLarge(): HttpError {
  return new HttpError(413, 'digest_too_large', 'Activity digest is larger than 256 KB')
}

/** The validated body with its derived values. A digest over the size limit is refused here. */
export function createInput(data: z.infer<typeof ActivityCreateSchema>): CreateInput {
  const digestJson = JSON.stringify(data.digest)
  const digestBytes = digestByteLength(digestJson)
  if (digestBytes > MAX_DIGEST_BYTES) throw digestTooLarge()
  checkDigestText(data.digest)
  return {
    ...data,
    digestJson,
    digestBytes,
    dedupeKey: workoutKey(data.digest.sport, data.digest.startMs),
  }
}

/** The caller's activity with this dedupe key, if there is one. */
export async function findExisting(
  db: Db,
  userId: string,
  dedupeKey: string,
): Promise<ActivityRow | undefined> {
  return db
    .select()
    .from(activities)
    .where(and(eq(activities.userId, userId), eq(activities.dedupeKey, dedupeKey)))
    .get()
}
