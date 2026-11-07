import type { LiftPutAnswer } from './liftTransport'
import { LiftTransportError } from './liftTransport'
import type { LiftStore, SentRow } from './liftStore'
import type { LiftRow } from './liftTransitions'

const BACKOFF_BASE_MS = 2_000
const BACKOFF_CAP_MS = 5 * 60_000

/** How long to wait before the next flush after a row's `attempts` failures: doubling from two seconds, capped at five minutes. */
export function retryDelayMs(attempts: number): number {
  return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1))
}

/** What a run of sends has done so far. */
export interface Tally {
  /** Rows the server took. */
  sent: number
  /** Rows a 400 changed: sent back to their confirmed values or removed, so not saved. */
  refused: number
  /** Rows a 409 turned away for want of room (adoption only; a flush stops at the first). */
  capped: number
  /** Sets the account already held when adopting with insertOnly. */
  skipped: number
  /** The wait before the next flush, from the most failed row held by a failure; null when none. */
  retryInMs: number | null
  /** The sign-in ended. */
  unauthorized: boolean
  /** A request failed in a way that will likely fail again: the run stopped. */
  stopped: boolean
  /** The newest account revision an answer carried. */
  liftRevision: number | null
}

export const newTally = (): Tally => ({
  sent: 0,
  refused: 0,
  capped: 0,
  skipped: 0,
  retryInMs: null,
  unauthorized: false,
  stopped: false,
  liftRevision: null,
})

const failureOf = (error: unknown): LiftTransportError =>
  error instanceof LiftTransportError ? error : new LiftTransportError('other')

export interface SendTarget {
  /** The store whose rows are sent and whose rows the answers settle. */
  store: LiftStore
  tally: Tally
  /** Called with each answer's revision. */
  onRevision: (liftRevision: number) => void
  /** The server took `rows`. */
  settle: (rows: readonly LiftRow[], answer: LiftPutAnswer) => Promise<void>
  /** A 409 ends a flush (what follows is all new keys); an adoption goes on, as later chunks may be sets the account holds. */
  stopOnCap: boolean
}

const sentOf = (rows: readonly LiftRow[]): SentRow[] =>
  rows.map((row) => ({ key: row.key, rev: row.rev }))

/**
 * Sends one chunk and applies the answer. A 400 reverts the rows it names and sends the rest again, since the server
 * took none of that request; a 400 naming none holds every row. Resolves false when the run must stop: a 401, or a
 * failure that will likely repeat (network, 429, 5xx). Another status (413 and the like) holds the chunk and goes on.
 */
export async function sendChunk(
  target: SendTarget,
  send: (rows: readonly LiftRow[]) => Promise<LiftPutAnswer>,
  start: readonly LiftRow[],
): Promise<boolean> {
  const { store, tally } = target
  const hold = async (rows: readonly LiftRow[]) => {
    await store.applyHeld(sentOf(rows))
    tally.retryInMs = Math.max(
      tally.retryInMs ?? 0,
      ...rows.map((row) => retryDelayMs(row.attempts + 1)),
    )
  }
  let rows = start
  while (rows.length > 0) {
    try {
      const answer = await send(rows)
      target.onRevision(answer.liftRevision)
      tally.liftRevision = Math.max(tally.liftRevision ?? answer.liftRevision, answer.liftRevision)
      await target.settle(rows, answer)
      tally.sent += rows.length
      tally.skipped += answer.skipped?.length ?? 0
      return true
    } catch (error) {
      const failure = failureOf(error)
      if (failure.kind === 'unauthorized') {
        tally.unauthorized = true
        tally.stopped = true
        return false
      }
      if (failure.kind === 'cap') {
        // Refused for room: the rows wait for room or the next session, with no attempt counted.
        tally.capped += rows.length
        tally.stopped = target.stopOnCap
        return !target.stopOnCap
      }
      if (failure.kind === 'invalid') {
        const named = rows.filter((_, index) => failure.refused.includes(index))
        if (named.length > 0) {
          tally.refused += await store.applyRefused(sentOf(named))
          rows = rows.filter((row) => !named.includes(row))
          continue
        }
      }
      await hold(rows)
      const goOn = failure.kind === 'invalid' || !failure.transient
      tally.stopped = !goOn
      return goOn
    }
  }
  return true
}
