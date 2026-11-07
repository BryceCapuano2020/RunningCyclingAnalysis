import {
  compareLiftSetKeys,
  MAX_LIFT_KEYS_PER_DELETE,
  MAX_LIFT_SETS_PER_WRITE,
} from '@rca/core/lift'
import type { LiftStore, SentRow } from './liftStore'
import { LiftTransportError } from './liftTransport'
import type { LiftTransport } from './liftTransport'
import type { LiftRow } from './liftTransitions'

export const FLUSH_LOCK = 'rca-lifts-flush'

const BACKOFF_BASE_MS = 2_000
const BACKOFF_CAP_MS = 5 * 60_000

/** How long to wait before the next flush after a row's `attempts` failures: doubling from two seconds, capped at five minutes. */
export function retryDelayMs(attempts: number): number {
  return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1))
}

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
  /** Rows a 400 sent back to their confirmed values, or removed; the athlete is told these were not saved. */
  refused: number
  /** Rows left for later: held after a failure, or new sets the account has no room for. */
  held: number
  /** Rows held by a failure; the wait before the next flush (retryDelayMs of the most failed), null when none. */
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
  /** False when a request failed: the device rows not yet sent stay. */
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
  /** Flushes, then pulls if the account's revision is not the one last pulled (or `seen`, when given, differs from it). */
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

const failureOf = (error: unknown): LiftTransportError =>
  error instanceof LiftTransportError ? error : new LiftTransportError('other')

export function createLiftSync(options: LiftSyncOptions): LiftSync {
  const { store, transport } = options
  const locks = options.locks ?? defaultLocks()
  let pulled = options.pulledRevision ?? null

  const sentOf = (rows: readonly LiftRow[]): SentRow[] =>
    rows.map((row) => ({ key: row.key, rev: row.rev }))

  const flushLocked = async (): Promise<FlushResult> => {
    const result: FlushResult = {
      sent: 0,
      refused: 0,
      held: 0,
      retryInMs: null,
      unauthorized: false,
      liftRevision: null,
    }
    const groups = sendOrder(await store.list())
    const note = (liftRevision: number) => {
      result.liftRevision = Math.max(result.liftRevision ?? liftRevision, liftRevision)
    }
    const failed = (rows: readonly LiftRow[]) => {
      result.held += rows.length
      result.retryInMs = Math.max(
        result.retryInMs ?? 0,
        ...rows.map((row) => retryDelayMs(row.attempts + 1)),
      )
    }
    /** Sends one chunk; resolves false when the flush must stop. */
    const sendChunk = async (group: Group, start: LiftRow[]): Promise<boolean> => {
      let rows = start
      while (rows.length > 0) {
        try {
          const answer =
            group === 'delete'
              ? await transport.remove(rows.map((row) => row.key))
              : await transport.put(rows.map((row) => row.set))
          note(answer.liftRevision)
          await Promise.all(
            rows.map((row) => store.applyAck(row.key, row.rev, answer.liftRevision)),
          )
          result.sent += rows.length
          return true
        } catch (error) {
          const failure = failureOf(error)
          if (failure.kind === 'unauthorized') {
            result.unauthorized = true
            return false
          }
          if (failure.kind === 'cap' && group === 'new') {
            // Only new keys are refused for room: they wait for room or the next session, with no attempt counted.
            result.held += rows.length
            return false
          }
          if (failure.kind === 'invalid') {
            const named = rows.filter((_, index) => failure.refused.includes(index))
            if (named.length === 0) {
              await store.applyHeld(sentOf(rows))
              failed(rows)
              return true
            }
            // The server took none of this request: revert the rows it names and send the rest again.
            result.refused += await store.applyRefused(sentOf(named))
            rows = rows.filter((row) => !named.includes(row))
            continue
          }
          await store.applyHeld(sentOf(rows))
          failed(rows)
          return false
        }
      }
      return true
    }
    for (const group of ['delete', 'replace', 'new'] as const) {
      const size = group === 'delete' ? MAX_LIFT_KEYS_PER_DELETE : MAX_LIFT_SETS_PER_WRITE
      for (const chunk of chunksOf(groups[group], size)) {
        if (!(await sendChunk(group, chunk))) return result
      }
    }
    return result
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
    if (complete) pulled = liftRevision
    return { complete, liftRevision, failed: false }
  }

  const flush = () => locks.request(FLUSH_LOCK, flushLocked)
  const pull = () => locks.request(FLUSH_LOCK, pullLocked)

  return {
    flush,
    pull,
    sync: async (seen) => {
      const flushed = await flush()
      const latest = flushed.liftRevision ?? seen ?? null
      const moved = latest !== null && latest !== pulled
      const needsFirst = pulled === null && latest === null
      return {
        flush: flushed,
        pull: !flushed.unauthorized && (moved || needsFirst) ? await pull() : null,
      }
    },
    adopt: (device) =>
      locks.request(FLUSH_LOCK, async () => {
        const rows = (await device.list()).filter((row) => row.state === 'put').sort(byKey)
        const result: AdoptResult = { sent: 0, skipped: 0, done: true }
        for (const chunk of chunksOf(rows, MAX_LIFT_SETS_PER_WRITE)) {
          try {
            const answer = await transport.put(
              chunk.map((row) => row.set),
              { insertOnly: true },
            )
            result.skipped += answer.skipped?.length ?? 0
            result.sent += chunk.length
            await Promise.all(chunk.map((row) => device.settle(row.key, row.rev)))
          } catch {
            result.done = false
            return result
          }
        }
        return result
      }),
  }
}
