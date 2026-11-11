import {
  ActivityCreateSchema,
  MAX_ACTIVITIES_PER_USER,
  MAX_DIGEST_BYTES_PER_USER,
  type ActivitySource,
} from '@rca/contract'
import { HttpError } from '../../errors.ts'
import { validationMessage } from '../../http.ts'
import { chargeDaily } from '../../budget.ts'
import { recordDatabaseSize } from '../../storage.ts'
import { must } from '../../util.ts'
import { ACTIVITY_COLUMNS, findOwnedActivity, toRecord, type ActivityRow } from './shared.ts'
import { requireCurrentRevision } from './revisionCheck.ts'
import { accountState, activityQuota, createRefusal } from './quota.ts'
import {
  createInput,
  findExisting,
  type CreateInput,
  type SaveContext,
  type Saved,
} from './saveInput.ts'
import { upgradeExisting } from './upgrade.ts'

export { saveContext, type SaveContext, type Saved } from './saveInput.ts'

/** A rebuild names the exact activity it came from, and never inserts one deleted elsewhere. */
async function replaceExact(
  ctx: SaveContext,
  userId: string,
  replace: string,
  input: CreateInput,
): Promise<Saved> {
  const target = await findOwnedActivity(ctx.db, userId, replace)
  if (target.dedupeKey !== input.dedupeKey) {
    throw new HttpError(
      409,
      'activity_conflict',
      'This activity starts at a different time from the one being replaced',
    )
  }
  return upgradeExisting(ctx, userId, target, input)
}

/**
 * One D1 batch: the row and its counters move together, and only if the insert is admitted. The
 * result carries the inserted row, or no row when the insert was refused or another request wrote
 * the same activity first.
 */
async function insertActivity(
  ctx: SaveContext,
  id: string,
  userId: string,
  input: CreateInput,
  source: ActivitySource,
): Promise<D1Result<ActivityRow>> {
  const { DB, deps } = ctx
  const { dedupeKey, digest, digestJson, digestBytes, fileName, fileHash } = input
  const [inserted] = await DB.batch<ActivityRow>([
    DB.prepare(
      `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
          digest_json, file_name, file_hash, created_at, source)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE (SELECT activity_count FROM users WHERE id = ?) < ?
         AND (SELECT digest_bytes FROM users WHERE id = ?) + ? <= ?
         AND coalesce((SELECT d1_size_bytes FROM r2_storage_budget WHERE id = 1), 0) <= ?
         AND EXISTS (SELECT 1 FROM users WHERE id = ? AND deleting_at IS NULL)
       ON CONFLICT(user_id, dedupe_key) DO NOTHING
       RETURNING ${ACTIVITY_COLUMNS}`,
    ).bind(
      id,
      userId,
      dedupeKey,
      digest.sport,
      digest.startMs,
      digest.name,
      digest.version,
      digestJson,
      fileName,
      fileHash,
      deps.now(),
      source,
      userId,
      MAX_ACTIVITIES_PER_USER,
      userId,
      digestBytes,
      MAX_DIGEST_BYTES_PER_USER,
      ctx.databaseLimit,
      userId,
    ),
    DB.prepare(
      `UPDATE users SET activity_count = activity_count + 1, digest_bytes = digest_bytes + ?
       WHERE id = ? AND EXISTS (SELECT 1 FROM activities WHERE id = ? AND user_id = ?)`,
    ).bind(digestBytes, userId, id, userId),
  ])
  return must(inserted, 'insert result')
}

/** Inserts a new activity, refunding its daily unit when a concurrent request wrote it first. */
async function insertNew(
  ctx: SaveContext,
  userId: string,
  input: CreateInput,
  source: ActivitySource,
): Promise<Saved> {
  const { DB, db, deps } = ctx
  // What the account cannot hold is refused before a daily unit is taken, so a refused create
  // writes nothing. The insert holds the same limits, for requests that race this check.
  const refusal = createRefusal(
    await accountState(DB, userId),
    input.digestBytes,
    ctx.databaseLimit,
  )
  if (refusal) throw refusal
  // Only a request that will insert a new row takes a daily create unit.
  const charge = await chargeDaily(DB, userId, 'activityCreate', deps.now())
  const id = deps.randomUUID()
  const inserted = await insertActivity(ctx, id, userId, input, source)
  const row = inserted.results[0]
  if (row) {
    // Only a create that wrote its row updates the size the guard reads.
    await recordDatabaseSize(DB, deps.now(), inserted.meta.size_after)
    return { status: 201, record: toRecord(row) }
  }

  await charge.refund()
  const existing = await findExisting(db, userId, input.dedupeKey)
  if (existing) return upgradeExisting(ctx, userId, existing, input)
  // Another request filled the account after the check above.
  throw (
    createRefusal(await accountState(DB, userId), input.digestBytes, ctx.databaseLimit) ??
    activityQuota()
  )
}

/**
 * The one create path (docs/design/garmin-sync.md decision 6): `POST /api/activities` and Garmin's ingest consumer
 * both save through it. It checks the body (the revision, the schema, the digest's size and text), holds the quotas,
 * dedupes on `workoutKey(sport, startMs)` and keeps the athlete's stored label and name. A refusal is an HttpError.
 * `source` is stored on a new row only: a duplicate keeps the source it was first saved with.
 */
export async function saveDigest(
  ctx: SaveContext,
  userId: string,
  body: unknown,
  options: { replace?: string; source?: ActivitySource } = {},
): Promise<Saved> {
  requireCurrentRevision(body)
  const parsed = ActivityCreateSchema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_request', validationMessage(parsed.error))
  }
  const input = createInput(parsed.data)

  if (options.replace !== undefined) return replaceExact(ctx, userId, options.replace, input)
  const existing = await findExisting(ctx.db, userId, input.dedupeKey)
  if (existing) return upgradeExisting(ctx, userId, existing, input)
  return insertNew(ctx, userId, input, options.source ?? 'file')
}
