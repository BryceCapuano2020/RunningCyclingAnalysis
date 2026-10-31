import { revisionStatus } from './digest/revisions'
import type { ActivityDigest, Sport } from './types'

/** How much of the analysis reads a digest: 2 if current, 1 if compatible, else 0. */
export function readRank(digest: ActivityDigest): number {
  const status = revisionStatus(digest.modelRevision)
  return status === 'current' ? 2 : status === 'compatible' ? 1 : 0
}

/** A digest the analysis does not read, with why: made by an older model that is held out, or by a newer app. */
export interface HeldOut {
  digest: ActivityDigest
  status: 'stale' | 'newer'
}

/** What the library lists of a held-out digest: who it is, never its numbers. */
export interface HeldOutActivity {
  id: string
  name: string
  sport: Sport
  startMs: number
  status: 'stale' | 'newer'
}

/**
 * The digests a session holds, by workout key, sorted by how the model revision stands (see `revisionStatus`):
 * `digests` are current, `readable` are compatible with the current model and read beside them, `heldOut`
 * are stale or newer and are listed but never analysed. The maps are never replaced, only emptied, because
 * sessionKeep.ts holds the same objects.
 */
export class SessionLibrary {
  readonly digests = new Map<string, ActivityDigest>()
  readonly readable = new Map<string, ActivityDigest>()
  readonly heldOut = new Map<string, HeldOut>()

  /** The held digest of a workout that is not current, if there is one. */
  notCurrent(key: string): ActivityDigest | undefined {
    return this.readable.get(key) ?? this.heldOut.get(key)?.digest
  }

  /** Files a digest under its status. A current digest leaves any other copy of the workout behind. */
  put(key: string, digest: ActivityDigest): void {
    this.drop(key)
    const status = revisionStatus(digest.modelRevision)
    if (status === 'current') this.digests.set(key, digest)
    else if (status === 'compatible') this.readable.set(key, digest)
    else this.heldOut.set(key, { digest, status })
  }

  /** Removes a workout from every map. */
  drop(key: string): void {
    this.digests.delete(key)
    this.readable.delete(key)
    this.heldOut.delete(key)
  }

  clear(): void {
    this.digests.clear()
    this.readable.clear()
    this.heldOut.clear()
  }

  /** Every digest the analysis reads: current, then compatible. */
  analysable(): [string, ActivityDigest][] {
    return [...this.digests, ...this.readable]
  }

  /** Held-out digests of one status. */
  countHeldOut(status: HeldOut['status']): number {
    let count = 0
    for (const held of this.heldOut.values()) if (held.status === status) count++
    return count
  }

  /** Every digest the library holds, whatever its status. */
  get size(): number {
    return this.digests.size + this.readable.size + this.heldOut.size
  }

  /** The held-out digests as the library lists them, newest first. */
  heldOutActivities(): HeldOutActivity[] {
    return [...this.heldOut.values()]
      .map(({ digest, status }) => ({
        id: digest.id,
        name: digest.name,
        sport: digest.sport,
        startMs: digest.startMs,
        status,
      }))
      .sort((a, b) => b.startMs - a.startMs || a.id.localeCompare(b.id))
  }
}
