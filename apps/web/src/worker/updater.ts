import type { ActivityRecord } from '@rca/contract'
import { missingFields, revisionStatus } from '@rca/core/digest/revisions'
import { haltsImport } from '@rca/core/session'
import type { Activity, ActivityDigest } from '@rca/core/types'
import { ApiRequestError } from '../api/client'
import { RATE_LIMIT_WINDOW_MS } from './rateLimitRetry'
import { syncIssueFor } from './syncIssue'
import { BREAKER_FAILURES, STEP_TIMEOUT_MS, UPDATE_PARALLELISM } from './updaterConfig'
import type { UpdateStop } from './updaterConfig'

/** The longest a rate limit is waited out. A longer Retry-After ends the activity as limited. */
const MAX_RATE_WAIT_MS = 2 * RATE_LIMIT_WINDOW_MS

/** What the updater does in the world, so the engine can be run on a fake clock and a fake server. */
export interface UpdateSteps {
  /** The activity's original file, downloaded and read; `activity` is undefined when it no longer matches. */
  original(record: ActivityRecord): Promise<{ fileHash: string; activity: Activity | undefined }>
  digest(activity: Activity): ActivityDigest
  /** Replaces this exact saved activity with the digest; answers with the record the server now holds. */
  replace(digest: ActivityDigest, record: ActivityRecord, fileHash: string): Promise<ActivityRecord>
  /** Takes one verified upgrade into the session and the saved records, and keeps its evidence. */
  keep(saved: ActivityRecord, activity: Activity): void | Promise<void>
  /**
   * Whether the library, user and writer this run started for are still the ones in force. Checked after
   * every await: a result that no longer matches is discarded, never applied.
   */
  stampHolds(): boolean
  /** Requests that change the library and are waiting behind this run. */
  waiting(): number
  sleep(ms: number): Promise<void>
  /** Records one unit of work, which the watchdog reads as progress. */
  note(): void
}

export interface UpdateResult {
  rebuilt: number
  /** Candidates whose original no longer matches them, or whose activity was deleted meanwhile. */
  unmatched: ActivityRecord[]
  failed: number
  /** Candidates a daily or rate limit kept from being tried, including the one that met it. */
  limited: number
  limitKind: 'daily' | 'rate' | null
  stopped: UpdateStop | null
}

/**
 * The saved activities an update rebuilds, newest first so the recent period and the fitness window
 * complete before the history: stale digests, and compatible ones that lack fields the current model
 * records, that have their original file and that no earlier rebuild found unmatched.
 */
export function updateCandidates(
  records: Iterable<ActivityRecord>,
  unmatched: ReadonlySet<string>,
): ActivityRecord[] {
  const candidates: ActivityRecord[] = []
  for (const record of records) {
    if (!record.hasFile || unmatched.has(record.id)) continue
    const { digest } = record
    const status = revisionStatus(digest.modelRevision)
    if (status === 'stale' || (status === 'compatible' && missingFields(digest).length > 0)) {
      candidates.push(record)
    }
  }
  return candidates.sort((a, b) => b.digest.startMs - a.digest.startMs)
}

type Outcome =
  | { kind: 'rebuilt' }
  | { kind: 'unmatched' }
  | { kind: 'failed' }
  | { kind: 'limit'; limit: 'daily' | 'rate' }
  | { kind: 'stop'; reason: UpdateStop }
  | { kind: 'halt'; error: unknown }

class StepTimeout extends Error {
  constructor() {
    super('A step of the update took too long')
    this.name = 'StepTimeout'
  }
}

/** Runs one attempt, failing it if it takes longer than a step may. Its late result is ignored. */
function timed<T>(call: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new StepTimeout()), STEP_TIMEOUT_MS)
    call()
      .then(resolve, reject)
      .finally(() => clearTimeout(timer))
  })
}

/** One attempt; a rate limit is waited out once and the attempt made again. */
async function attemptOnce<T>(call: () => Promise<T>, steps: UpdateSteps): Promise<T> {
  try {
    return await timed(call)
  } catch (error) {
    if (syncIssueFor(error) !== 'rate-limited') throw error
    const waitMs =
      (error instanceof ApiRequestError ? error.retryAfterMs : undefined) ?? RATE_LIMIT_WINDOW_MS
    if (waitMs > MAX_RATE_WAIT_MS) throw error
    await steps.sleep(waitMs)
    return timed(call)
  }
}

/** What the file cannot give is kept from the saved digest: the athlete's own label. */
function withSavedLabel(digest: ActivityDigest, saved: ActivityDigest): ActivityDigest {
  return digest.athleteType === undefined && saved.athleteType !== undefined
    ? { ...digest, athleteType: saved.athleteType }
    : digest
}

/** The rebuilt digest is the same activity, made by the current model, or it is not sent. */
function isRebuildOf(digest: ActivityDigest, saved: ActivityDigest): boolean {
  return (
    digest.id === saved.id &&
    digest.sport === saved.sport &&
    digest.startMs === saved.startMs &&
    revisionStatus(digest.modelRevision) === 'current'
  )
}

const stop = (reason: UpdateStop): Outcome => ({ kind: 'stop', reason })

/** Rebuilds one activity: download, read, digest, verify, save, verify the answer, keep. */
async function rebuildOne(record: ActivityRecord, steps: UpdateSteps): Promise<Outcome> {
  const { fileHash, activity } = await attemptOnce(() => steps.original(record), steps)
  if (!steps.stampHolds()) return stop('discarded')
  if (activity === undefined) return { kind: 'unmatched' }
  const digest = withSavedLabel(steps.digest(activity), record.digest)
  if (!isRebuildOf(digest, record.digest)) return { kind: 'failed' }
  // An answer that still carries the old revision means another request changed the row between the
  // read and the write, and the server kept its own; the same digest is sent once more.
  for (let attempt = 0; attempt < 2; attempt++) {
    const saved = await attemptOnce(() => steps.replace(digest, record, fileHash), steps)
    if (!steps.stampHolds()) return stop('discarded')
    const status = revisionStatus(saved.digest.modelRevision)
    if (status === 'current') {
      try {
        await steps.keep(saved, activity)
      } catch {
        // The digest is saved and shown; only the evidence kept beside it was lost.
      }
      return { kind: 'rebuilt' }
    }
    if (status === 'newer') return stop('newer')
  }
  return { kind: 'failed' }
}

/** What an error from a step means for the run. */
function classify(error: unknown): Outcome {
  if (error instanceof ApiRequestError) {
    if (error.code === 'app_outdated') return stop('outdated')
    // The server refuses a digest it cannot read, or one from a newer model than it knows, with 400.
    if (error.status === 400) return stop('refused')
  }
  const issue = syncIssueFor(error)
  if (haltsImport(issue)) return { kind: 'halt', error }
  if (error instanceof ApiRequestError && error.status === 404) return { kind: 'unmatched' }
  // The stored original no longer matches a different saved copy, so it cannot be matched.
  if (issue === 'activity-conflict') return { kind: 'unmatched' }
  if (issue === 'daily-limit') return { kind: 'limit', limit: 'daily' }
  if (issue === 'rate-limited') return { kind: 'limit', limit: 'rate' }
  return { kind: 'failed' }
}

/**
 * Rebuilds the candidates from their original files, two at a time, each a full step of its own. It
 * stops, keeping what it did, at the first of: a limit, `BREAKER_FAILURES` failures in a row, an
 * `app_outdated` or newer answer, a request waiting to change the library, or a stamp that no longer
 * holds. A sign-out or account change throws, as every halting save failure does. A daily limit outranks
 * a rate limit when both are met.
 */
export async function runUpdate(
  candidates: readonly ActivityRecord[],
  steps: UpdateSteps,
): Promise<UpdateResult> {
  const result: UpdateResult = {
    rebuilt: 0,
    unmatched: [],
    failed: 0,
    limited: 0,
    limitKind: null,
    stopped: null,
  }
  let next = 0
  let failuresInARow = 0
  // Held in an object, so the lanes' writes are not narrowed away where it is read.
  const halt: { error: { cause: unknown } | null } = { error: null }

  const settle = (record: ActivityRecord, outcome: Outcome) => {
    switch (outcome.kind) {
      case 'rebuilt':
        result.rebuilt++
        failuresInARow = 0
        break
      case 'unmatched':
        result.unmatched.push(record)
        break
      case 'failed':
        result.failed++
        if (++failuresInARow >= BREAKER_FAILURES) result.stopped ??= 'breaker'
        break
      case 'limit':
        result.limited++
        if (outcome.limit === 'daily' || result.limitKind === null) result.limitKind = outcome.limit
        break
      case 'stop':
        result.stopped ??= outcome.reason
        break
      case 'halt':
        halt.error ??= { cause: outcome.error }
        break
    }
  }

  const lane = async () => {
    while (result.stopped === null && halt.error === null && result.limitKind === null) {
      if (steps.waiting() > 0) {
        result.stopped = 'paused'
        return
      }
      const record = candidates[next++]
      if (record === undefined) return
      steps.note()
      let outcome: Outcome
      try {
        outcome = await rebuildOne(record, steps)
      } catch (error) {
        outcome = classify(error)
      }
      settle(record, outcome)
    }
  }
  await Promise.all(Array.from({ length: UPDATE_PARALLELISM }, lane))
  if (halt.error !== null) throw halt.error.cause
  // Once a download limit is reached, further downloads would be refused the same way.
  if (result.limitKind !== null) result.limited += Math.max(0, candidates.length - next)
  return result
}
