import type { WorkerRequest, WorkerResponse } from '../../worker/protocol'
import type { Pending } from './model'

/** How long the page waits on a request before it says so, and before it gives up on the worker. */
export interface StallLimits {
  /** With no headway for this long, the page says the work is slow. */
  noticeMs: number
  /** With no headway for this long, the worker is replaced (or, for a read, the request is let go). */
  stallMs: number
}

/**
 * What a stalled request costs the worker. 'restart' replaces it: the work is analysis the page cannot
 * do without. 'release' only lets the request go unanswered ("unread" to its caller) and leaves the
 * worker alone: these are single reads the page can live without, and a restart would cost a running
 * import more than the read is worth.
 */
export type StallAction = 'restart' | 'release'

interface StallRule extends StallLimits {
  action: StallAction
}

/**
 * Long work: an import, a library load or a rebuild can hold the worker busy for a long time. The
 * stall is longer than the longest single wait inside it: an original-file transfer's 120 s deadline,
 * and a rate-limit wait (those also count as headway as they go).
 */
const LONG: StallRule = { noticeMs: 90_000, stallMs: 180_000, action: 'restart' }
/** Analysis that answers in moments when the worker is healthy. */
const SHORT: StallRule = { noticeMs: 30_000, stallMs: 60_000, action: 'restart' }
/** Single reads; never worth a restart, and never worth a notice: nobody is waiting on the page for them. */
const READ: StallRule = { noticeMs: Infinity, stallMs: 30_000, action: 'release' }
/** A read that rebuilds a recording from the kept original file can take a download's time. */
const READ_ORIGINAL: StallRule = { noticeMs: Infinity, stallMs: 150_000, action: 'release' }

const RULES: Record<WorkerRequest['type'], StallRule> = {
  addFiles: LONG,
  rebuildStale: LONG,
  loadServer: LONG,
  loadDevice: LONG,
  exportData: LONG,
  loadSample: SHORT,
  setSettings: SHORT,
  setRange: SHORT,
  clear: SHORT,
  keepProvisional: LONG,
  deleteDeviceActivity: SHORT,
  deleteActivity: SHORT,
  routeShape: READ,
  activitySplits: READ,
  activityTrace: READ,
  forgetRoutes: READ,
}

/**
 * How long a worker may sit on requests without starting any of them before it counts as not
 * answering at all. A worker that is only busy announces each request it begins.
 */
export const START_LIMIT_MS = 60_000

export type Stall = 'ok' | 'slow' | StallAction

/** Records that the request began: it is timed from now, not from when it was sent. */
export function noteActivity(pending: Pending, message: WorkerResponse, now = Date.now()): void {
  if (message.type === 'started') {
    pending.startedAt = now
    pending.activeAt = now
  } else if (message.type === 'heartbeat') {
    // A beat that reports the same work as the last one says the worker is alive, not that it got anywhere.
    if (message.progress !== pending.progress) pending.activeAt = now
    pending.progress = message.progress
  } else {
    pending.activeAt = now
  }
}

/**
 * Where the oldest request being run stands: fine, slow (worth saying so) or stalled (worth acting on).
 * Only the request the worker has begun is timed, since the others wait their turn behind it. If the
 * worker has said nothing at all for START_LIMIT_MS while requests wait, it is not answering.
 */
export function stallOf(
  waiting: readonly Pending[],
  now = Date.now(),
  lastHeardAt = 0,
): { pending: Pending; stall: Stall } | null {
  const running = waiting.find((pending) => pending.startedAt !== undefined)
  if (running === undefined) {
    const oldest = waiting[0]
    if (oldest === undefined) return null
    // Silence is what counts: a worker still busy with a request the page let go keeps beating.
    const quiet = now - Math.max(oldest.sentAt, lastHeardAt)
    return { pending: oldest, stall: quiet >= START_LIMIT_MS ? 'restart' : 'ok' }
  }
  const rule = running.fromOriginal === true ? READ_ORIGINAL : RULES[running.kind]
  const quiet = now - (running.activeAt ?? running.startedAt ?? now)
  if (quiet >= rule.stallMs) return { pending: running, stall: rule.action }
  return { pending: running, stall: quiet >= rule.noticeMs ? 'slow' : 'ok' }
}

/**
 * The page lost time it cannot account for (a suspended laptop, a frozen tab): what looked like silence
 * is not evidence, so every wait starts counting again from now.
 */
export function resetActivity(waiting: readonly Pending[], now = Date.now()): void {
  for (const pending of waiting) if (pending.activeAt !== undefined) pending.activeAt = now
}
