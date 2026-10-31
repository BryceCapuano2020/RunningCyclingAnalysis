import { workoutKey } from '@rca/core/duplicates'
import { START, digestFixture } from './harness.ts'

export interface SeedSpec {
  userId: string
  /** The model revision the stored digest carries, written as given: the server refuses to create most of them. */
  revision: number
  /** Fields of the digest, over `digestFixture`. */
  digest?: Record<string, unknown>
  fileName?: string
  /** Lowercase hex SHA-256 of the original file. */
  fileHash: string
  id?: string
  createdAt?: number
}

/**
 * Stores an activity row directly in D1, the way a library written by an older build looks, and moves the
 * user's counters as a create would. Tests seed old revisions here: the create route refuses a digest from
 * a stale model (`app_outdated`), so POSTing one no longer produces a stale row.
 */
export async function seedActivityRow(db: D1Database, spec: SeedSpec): Promise<string> {
  const digest = digestFixture({ ...spec.digest, modelRevision: spec.revision })
  const json = JSON.stringify(digest)
  const bytes = new TextEncoder().encode(json).byteLength
  const id = spec.id ?? crypto.randomUUID()
  const sport = digest.sport as 'run' | 'ride'
  const startMs = digest.startMs as number
  await db.batch([
    db
      .prepare(
        `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
          digest_json, file_name, file_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        spec.userId,
        workoutKey(sport, startMs),
        sport,
        startMs,
        digest.name,
        digest.version,
        json,
        spec.fileName ?? 'ride.fit',
        spec.fileHash,
        spec.createdAt ?? START,
      ),
    db
      .prepare(
        'UPDATE users SET activity_count = activity_count + 1, digest_bytes = digest_bytes + ? WHERE id = ?',
      )
      .bind(bytes, spec.userId),
  ])
  return id
}
