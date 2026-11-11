import { eq, sql } from 'drizzle-orm'
import { MAX_DIGEST_BYTES, MAX_DIGEST_BYTES_PER_USER } from '@rca/contract'
import { accountDeleting, HttpError } from '../../errors.ts'
import { activities } from '../../db/schema.ts'
import { must } from '../../util.ts'
import { toRecordHolding, type ActivityRow } from './shared.ts'
import { keepStoredLabel, keepStoredName } from './storedLabel.ts'
import { accountState, databaseFull, digestQuota } from './quota.ts'
import {
  CONFLICTING_FILE_MESSAGE,
  digestByteLength,
  digestTooLarge,
  findExisting,
  type CreateInput,
  type SaveContext,
  type Saved,
} from './saveInput.ts'

/** Moves the digest counter in one guarded write; a refusal is explained from the account. */
async function reserveDigestDelta(
  db: D1Database,
  userId: string,
  delta: number,
  databaseLimit: number,
): Promise<void> {
  // A shrinking digest is always admitted, even by an account already above the cap, and so is one
  // that does not grow while the database is over its soft limit.
  const reserved = await db
    .prepare(
      `UPDATE users SET digest_bytes = digest_bytes + ?1
       WHERE id = ?2 AND deleting_at IS NULL AND (?1 <= 0 OR digest_bytes + ?1 <= ?3)
         AND (?1 <= 0 OR coalesce((SELECT d1_size_bytes FROM r2_storage_budget WHERE id = 1), 0) <= ?4)
       RETURNING id`,
    )
    .bind(delta, userId, MAX_DIGEST_BYTES_PER_USER, databaseLimit)
    .first()
  if (reserved) return
  const state = await accountState(db, userId)
  if (state.deletingAt !== null) throw accountDeleting()
  if (delta > 0 && state.databaseBytes > databaseLimit) {
    throw databaseFull()
  }
  throw digestQuota()
}

/** The digest a newer model revision of the same original file replaces the stored one with. */
interface DigestUpgrade {
  digestJson: string
  digestVersion: number
  name: string
  modelRevision: number
  fileHash: string
}

/**
 * Replaces an activity's digest with a newer model revision of the same original file. The
 * per-user digest counter moves by the size difference before the row changes. If the row no
 * longer matches (another request upgraded or deleted it first) the move is undone and null is
 * returned.
 */
async function upgradeDigest(
  ctx: SaveContext,
  userId: string,
  existing: ActivityRow,
  next: DigestUpgrade,
): Promise<ActivityRow | null> {
  const { DB, db } = ctx
  // Only a newer model revision upgrades. Check it before reserving quota, so a request that cannot
  // upgrade is never refused for quota it does not need.
  const stored = await db
    .select({
      revision: sql<number>`coalesce(json_extract(${activities.digestJson}, '$.modelRevision'), 1)`,
    })
    .from(activities)
    .where(eq(activities.id, existing.id))
    .get()
  if (!stored || stored.revision >= next.modelRevision) return null
  const delta = digestByteLength(next.digestJson) - digestByteLength(existing.digestJson)
  await reserveDigestDelta(DB, userId, delta, ctx.databaseLimit)
  // The reservation is undone unless the digest was replaced, including when the update itself fails.
  let replaced = false
  try {
    // The library version moves in the same batch, only if the row did (no trigger: see migration 0014).
    const [updated] = await DB.batch([
      DB.prepare(
        `UPDATE activities SET digest_json = ?1, digest_version = ?2, name = ?3
         WHERE id = ?4 AND user_id = ?5 AND file_hash = ?6
           AND digest_json = ?7
           AND coalesce(json_extract(digest_json, '$.modelRevision'), 1) < ?8`,
      ).bind(
        next.digestJson,
        next.digestVersion,
        next.name,
        existing.id,
        userId,
        next.fileHash,
        // Only the exact digest that the reservation was sized against is replaced.
        existing.digestJson,
        next.modelRevision,
      ),
      DB.prepare(
        'UPDATE users SET library_version = library_version + 1 WHERE id = ? AND changes() = 1',
      ).bind(userId),
    ])
    const result = must(updated, 'upgrade result')
    replaced = result.meta.changes === 1
    if (!replaced) return null
    return {
      ...existing,
      digestJson: next.digestJson,
      digestVersion: next.digestVersion,
      name: next.name,
    }
  } finally {
    if (!replaced) {
      await DB.prepare('UPDATE users SET digest_bytes = digest_bytes - ? WHERE id = ?')
        .bind(delta, userId)
        .run()
    }
  }
}

/** A matching create answers with the activity, after upgrading it if the model is newer. */
export async function upgradeExisting(
  ctx: SaveContext,
  userId: string,
  existing: ActivityRow,
  input: CreateInput,
): Promise<Saved> {
  if (existing.fileHash !== input.fileHash) {
    throw new HttpError(409, 'activity_conflict', CONFLICTING_FILE_MESSAGE)
  }
  // A matching source file can be re-digested after a model change. The update only applies
  // while the stored revision is older, so simultaneous retries cannot downgrade the digest.
  // The athlete's own label, set since the file was read, is kept (storedLabel.ts); it is part of the digest, so
  // it counts against the size limit the digest was checked against without it.
  // The name the athlete gave it is kept too (a rename, `name_override`), in the digest and the row.
  const digestJson = keepStoredName(
    existing.nameOverride,
    keepStoredLabel(existing.digestJson, input.digest, input.digestJson),
  )
  if (digestByteLength(digestJson) > MAX_DIGEST_BYTES) throw digestTooLarge()
  const upgraded = await upgradeDigest(ctx, userId, existing, {
    digestJson,
    digestVersion: input.digest.version,
    name: existing.nameOverride ?? input.digest.name,
    modelRevision: input.digest.modelRevision,
    fileHash: input.fileHash,
  })
  if (upgraded) return { status: 200, record: toRecordHolding(upgraded, input.digest) }

  const latest = await findExisting(ctx.db, userId, input.dedupeKey)
  if (!latest) throw new HttpError(404, 'not_found', 'Activity not found')
  if (latest.fileHash !== input.fileHash) {
    throw new HttpError(409, 'activity_conflict', CONFLICTING_FILE_MESSAGE)
  }
  return { status: 200, record: toRecordHolding(latest, input.digest) }
}
