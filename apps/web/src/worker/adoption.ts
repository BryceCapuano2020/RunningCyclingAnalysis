import type { ActivityRecord } from '@rca/contract'
import { revisionStatus } from '@rca/core/digest/revisions'
import type { SyncIssueCode } from '@rca/core/session'
import type { ActivityDigest } from '@rca/core/types'
import { workoutKeyOf } from './device'
import type { DeviceEntry, DeviceLibrary } from './deviceLibrary'
import type { Outbox, OutboxRow } from './outbox'
import type { SendingKeys } from './sendingKeys'
import { resumeOutbox } from './outboxResume'
import type { RowOutcome } from './outboxResume'
import type { WorkerResponse } from './protocol'

/**
 * What a signed-in visit can do with the activities this browser kept while nobody was signed in:
 * `adoptable` can be added to the account (they have the hash of their file and were analysed by the
 * current model, and the account does not hold the workout), `again` need their files added again (no
 * hash, or an older model), and `held` are workouts the account has already.
 */
export interface DeviceOffer {
  adoptable: number
  again: number
  held: number
}

export interface AdoptionPlan {
  adoptable: DeviceEntry[]
  again: number
  held: number
}

/** The workouts the account holds, by the key a workout is told apart by. */
export function heldKeysOf(records: ReadonlyMap<string, ActivityRecord>): Set<string> {
  return new Set([...records.values()].map(({ digest }) => workoutKeyOf(digest)))
}

/** Whether the server takes a digest of this revision: the current one, or one it reads beside its own. */
function addable(digest: ActivityDigest): boolean {
  const status = revisionStatus(digest.modelRevision)
  return status === 'current' || status === 'compatible'
}

/** Sorts what this browser kept into what can be added, what needs its file again, and what the account has. */
export function planAdoption(
  entries: readonly DeviceEntry[],
  held: ReadonlySet<string>,
): AdoptionPlan {
  const adoptable: DeviceEntry[] = []
  let again = 0
  let alreadyThere = 0
  for (const entry of entries) {
    if (held.has(entry.workoutKey)) alreadyThere++
    else if (entry.file === undefined || !addable(entry.digest)) again++
    else adoptable.push(entry)
  }
  return { adoptable, again, held: alreadyThere }
}

/**
 * What the kept library holds against the account: the offer, and whether it holds anything at all (rows this
 * version cannot read count, since they are kept). Null when it cannot be read: nothing is offered on a guess.
 */
export async function standingOf(
  library: DeviceLibrary,
  records: ReadonlyMap<string, ActivityRecord>,
): Promise<{ offer: DeviceOffer; holds: boolean } | null> {
  try {
    const entries = await library.all()
    const { adoptable, again, held } = planAdoption(entries, heldKeysOf(records))
    return {
      offer: { adoptable: adoptable.length, again, held },
      holds: entries.length > 0 || library.skipped() > 0,
    }
  } catch {
    return null
  }
}

/**
 * After a row's save ended: if the row is a kept activity and the account has that file now, the kept row goes,
 * only if it still holds the digest that was saved, and so does what else was kept for it. Used for the saves an
 * Add makes and for those a later load finishes (after a stop, or a reload).
 */
export async function followUpAdopted(
  ctx: {
    library: DeviceLibrary
    savedRecords: ReadonlyMap<string, ActivityRecord>
    adopted?: (digestId: string) => Promise<void>
  },
  row: OutboxRow,
  outcome: RowOutcome,
): Promise<void> {
  if (row.fromDevice !== true) return
  // 'held': a save that an earlier visit made and did not hear back from counts when the account's copy is this file.
  const accountHas =
    outcome === 'saved' ||
    (outcome === 'held' &&
      [...ctx.savedRecords.values()].some((record) => record.digest.id === row.digestId))
  if (accountHas && (await ctx.library.removeIfDigest(row.key, row.digestId)))
    await ctx.adopted?.(row.digestId)
}

export interface AdoptionContext {
  userId: string
  library: DeviceLibrary
  outbox: Outbox
  savedRecords: Map<string, ActivityRecord>
  /** The workouts an import is sending, shared with the outbox resume. */
  sending: SendingKeys
  post: (message: WorkerResponse) => void
  /** Called for each kept activity the account now has, after its row is removed, to drop what else was kept for it. */
  adopted?: (digestId: string) => Promise<void>
}

export interface AdoptionResult {
  saved: number
  /** The account holds another file for the same workout (same second), so the kept one stays here. */
  conflicts: number
  /** Not added for any other reason (it failed, or saving was stopped first), and still kept here to try again. */
  failed: number
  again: number
  held: number
  stopped: SyncIssueCode | null
}

/**
 * Adds the adoptable activities kept in this browser to the account. Each goes to the outbox first, so a
 * reload finishes the job, and is saved as an import's are. A kept row is removed only once the account
 * has that activity, and only if it still holds the digest that was saved. Routes are not copied.
 */
export async function adoptDevice(ctx: AdoptionContext): Promise<AdoptionResult> {
  // The epoch the kept library had when it was read: another tab's Remove all raises it, and then nothing is added.
  const epoch = await ctx.library.epoch()
  const plan = planAdoption(await ctx.library.all(), heldKeysOf(ctx.savedRecords))
  const digestIds = new Map(plan.adoptable.map((entry) => [entry.workoutKey, entry.digest.id]))
  // Newest first, so a limit that stops the rest costs the oldest.
  const newest = [...plan.adoptable].sort((a, b) => b.digest.startMs - a.digest.startMs)
  for (const { digest, file } of newest) {
    if (file !== undefined)
      await ctx.outbox.add({
        digest,
        fileName: file.fileName,
        fileHash: file.fileHash,
        fromDevice: true,
      })
  }
  // Only the kept activities are counted: the outbox may hold rows of earlier imports, which are saved too.
  const counts = { saved: 0, conflicts: 0 }
  const settled = async (row: OutboxRow, outcome: RowOutcome): Promise<void> => {
    const digestId = digestIds.get(row.key)
    if (digestId === undefined) return
    if (outcome === 'conflict') counts.conflicts++
    if (outcome === 'saved') counts.saved++
    await followUpAdopted(ctx, row, outcome)
  }
  const result = await resumeOutbox({
    userId: ctx.userId,
    outbox: ctx.outbox,
    savedRecords: ctx.savedRecords,
    sending: ctx.sending,
    post: ctx.post,
    // Fails closed: a library that cannot say what epoch it is in is not added from.
    allowed: async (row) =>
      !digestIds.has(row.key) || (await ctx.library.epoch().catch(() => -1)) === epoch,
    settled,
  }).finished
  return {
    ...counts,
    // Everything else stays kept here: it failed, or the saves were stopped before its turn.
    failed: plan.adoptable.length - counts.saved - counts.conflicts,
    again: plan.again,
    held: plan.held,
    stopped: result.stopped,
  }
}
