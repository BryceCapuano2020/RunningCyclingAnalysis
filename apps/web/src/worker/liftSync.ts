import {
  compareLiftSetKeys,
  MAX_LIFT_KEYS_PER_DELETE,
  MAX_LIFT_SETS_PER_WRITE,
} from '@rca/core/lift'
import type { LiftStore } from './liftStore'
import { newTally, sendChunk } from './liftSend'
import type { SendTarget } from './liftSend'
import type { LiftTransport } from './liftTransport'
import type { LiftRow } from './liftTransitions'

export const FLUSH_LOCK = 'rca-lifts-flush'

export { retryDelayMs } from './liftSend'

/** The part of the Web Locks API the engine uses. */
export interface LockProvider {
  request<T>(name: string, work: () => Promise<T>): Promise<T>
}

let memoryTail: Promise<unknown> = Promise.resolve()

/** Where `navigator.locks` is missing: one queue per page, which still keeps one flush in flight there. */
const memoryLock: LockProvider = {
  request: (_name, work) => {
    const run = memoryTail.then(work, work)
    memoryTail = run.catch(() => undefined)
    return run
  },
}

function defaultLocks(): LockProvider {
  const manager = typeof navigator === 'undefined' ? undefined : navigator.locks
  return manager === undefined
    ? memoryLock
    : { request: (name, work) => manager.request(name, work) }
}

export interface FlushResult {
  /** Rows the server took. */
  sent: number
  /** Rows a 400 changed: sent back to their confirmed values or removed. The athlete is told these were not saved. */
  refused: number
  /** Every row left unsent: held after a failure, turned away for room, or not reached because the flush stopped. */
  held: number
  /** The wait before the next flush (retryDelayMs of the most failed row held by a failure), null when none. */
  retryInMs: number | null
  /** The sign-in ended: the flush stopped. */
  unauthorized: boolean
  /** The newest account revision an answer carried, null when none answered. */
  liftRevision: number | null
}

export interface PullResult {
  /** Every page carried the same revision, so rows the account lacks were removed. */
  complete: boolean
  liftRevision: number | null
  /** The pull stopped on a failure. */
  failed: boolean
}

export interface AdoptResult {
  /** Device rows the account took (inserted or already held). */
  sent: number
  /** Sets the account already held, which stayed. */
  skipped: number
  /** Device rows a 400 removed. */
  refused: number
  /** Device rows the account had no room for; they stay on the device. */
  capped: number
  /** The sign-in ended. */
  unauthorized: boolean
  /** False when a request failed and the rest was not tried: the device rows not yet sent stay. */
  done: boolean
}

export interface LiftSyncOptions {
  store: LiftStore
  transport: LiftTransport
  locks?: LockProvider
  /** The account revision of the last complete pull, when the caller kept it. */
  pulledRevision?: number | null
}

export interface LiftSync {
  /** Sends what is waiting. One flush at a time per browser. */
  flush(): Promise<FlushResult>
  /** Reads the account's sets and applies them. */
  pull(): Promise<PullResult>
  /** Flushes, then pulls while the newest revision seen (from answers, or `seen`) is not the one last pulled. */
  sync(seen?: number): Promise<{ flush: FlushResult; pull: PullResult | null }>
  /** Sends the device store's sets with insertOnly and removes the ones sent. */
  adopt(device: LiftStore): Promise<AdoptResult>
}

type Group = 'delete' | 'replace' | 'new'

const chunksOf = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const byKey = (a: LiftRow, b: LiftRow) => compareLiftSetKeys(a.key, b.key)

/** Waiting rows in send order: deletes, then puts of keys the server has values for, then new keys. */
export function sendOrder(rows: readonly LiftRow[]): Record<Group, LiftRow[]> {
  const waiting = rows.filter((row) => row.state !== 'synced')
  return {
    delete: waiting.filter((row) => row.state === 'delete').sort(byKey),
    replace: waiting.filter((row) => row.state === 'put' && row.saved !== undefined).sort(byKey),
    new: waiting.filter((row) => row.state === 'put' && row.saved === undefined).sort(byKey),
  }
}

export function createLiftSync(options: LiftSyncOptions): LiftSync {
  const { store, transport } = options
  const locks = options.locks ?? defaultLocks()
  /** The revision the store last matched the account at, by a complete pull or by an ack that only our write moved. */
  let pulled = options.pulledRevision ?? null
  /** The newest revision any answer or caller reported. */
  let latest: number | null = pulled

  const noteRevision = (liftRevision: number) => {
    // An answer one past the last known revision means only our own write happened: nothing to pull.
    if (pulled !== null && liftRevision === pulled + 1 && latest === pulled) pulled = liftRevision
    latest = Math.max(latest ?? liftRevision, liftRevision)
  }

  const flushLocked = async (): Promise<FlushResult> => {
    const groups = sendOrder(await store.list())
    const waiting = groups.delete.length + groups.replace.length + groups.new.length
    const tally = newTally()
    const target: SendTarget = {
      store,
      tally,
      onRevision: noteRevision,
      settle: async (rows, answer) => {
        await Promise.all(rows.map((row) => store.applyAck(row.key, row.rev, answer.liftRevision)))
      },
      stopOnCap: true,
    }
    run: for (const group of ['delete', 'replace', 'new'] as const) {
      const size = group === 'delete' ? MAX_LIFT_KEYS_PER_DELETE : MAX_LIFT_SETS_PER_WRITE
      const send = (rows: readonly LiftRow[]) =>
        group === 'delete'
          ? transport.remove(rows.map((row) => row.key))
          : transport.put(rows.map((row) => row.set))
      for (const chunk of chunksOf(groups[group], size))
        if (!(await sendChunk(target, send, chunk))) break run
    }
    return {
      sent: tally.sent,
      refused: tally.refused,
      held: waiting - tally.sent - tally.refused,
      retryInMs: tally.retryInMs,
      unauthorized: tally.unauthorized,
      liftRevision: tally.liftRevision,
    }
  }

  const pullLocked = async (): Promise<PullResult> => {
    const items: LiftRow['set'][] = []
    const revisions = new Set<number>()
    let cursor: string | null = null
    try {
      do {
        const page = await transport.page(cursor)
        items.push(...page.items)
        revisions.add(page.liftRevision)
        cursor = page.next
      } while (cursor !== null)
    } catch {
      return { complete: false, liftRevision: null, failed: true }
    }
    const complete = revisions.size === 1
    const liftRevision = Math.max(...revisions)
    await store.applyPull(items, liftRevision, complete)
    latest = Math.max(latest ?? liftRevision, liftRevision)
    if (complete) pulled = liftRevision
    return { complete, liftRevision, failed: false }
  }

  const adoptLocked = async (device: LiftStore): Promise<AdoptResult> => {
    const all = await device.list()
    // The device has no server, so a delete row there (left by an earlier version) has nothing to send.
    await Promise.all(
      all.filter((row) => row.state === 'delete').map((row) => device.settle(row.key, row.rev)),
    )
    const rows = all.filter((row) => row.state === 'put').sort(byKey)
    const tally = newTally()
    const target: SendTarget = {
      store: device,
      tally,
      // Adopted sets are on the account and not in the store: the revision moved for more than our own write.
      onRevision: (liftRevision) => {
        latest = Math.max(latest ?? liftRevision, liftRevision)
      },
      settle: async (sent) => {
        await Promise.all(sent.map((row) => device.settle(row.key, row.rev)))
      },
      stopOnCap: false,
    }
    const send = (chunk: readonly LiftRow[]) =>
      transport.put(
        chunk.map((row) => row.set),
        { insertOnly: true },
      )
    for (const chunk of chunksOf(rows, MAX_LIFT_SETS_PER_WRITE))
      if (!(await sendChunk(target, send, chunk))) break
    return {
      sent: tally.sent,
      skipped: tally.skipped,
      refused: tally.refused,
      capped: tally.capped,
      unauthorized: tally.unauthorized,
      done: !tally.stopped,
    }
  }

  const flush = () => locks.request(FLUSH_LOCK, flushLocked)
  const pull = () => locks.request(FLUSH_LOCK, pullLocked)

  return {
    flush,
    pull,
    sync: async (seen) => {
      const flushed = await flush()
      if (seen !== undefined) latest = Math.max(latest ?? seen, seen)
      const stale = pulled === null || latest !== pulled
      return { flush: flushed, pull: !flushed.unauthorized && stale ? await pull() : null }
    },
    adopt: (device) => locks.request(FLUSH_LOCK, () => adoptLocked(device)),
  }
}
