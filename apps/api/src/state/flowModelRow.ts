import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { LIFT_REVISION } from '@rca/core/lift'
import {
  ANALYSIS_REVISION,
  STATE_SNAPSHOT_VERSION,
  snapshotIsCurrent,
} from '@rca/core/stateSnapshot'
import { resultRevisionOf } from './resultRevision.ts'
import type { JobRow } from './row.ts'

export type JobStep = 'idle' | 'first' | 'before' | 'row' | 'read' | 'record'

export interface Proc {
  pc: JobStep
  build: number
  holdsClaim: boolean
  readAt: number
  tornRead: boolean
  decidedOnHash: number | null
  decidedOnThisBuild: boolean
  libAtRequest: number
  serveAttempt: number
}

export type Claim = 'released' | 'inWindow' | 'lapsedUnderHold' | 'lapsedPastHold'

export type SnapshotReadAt = number | typeof TORN_READ

export interface Row {
  lib: number
  hash: SnapshotReadAt | null
  version: number
  day: number
  rev: number
  computed: number
  claim: Claim
  owner: number | null
  messagePending: boolean
  computeBeganRecently: boolean
}

const BUDGET = [
  'writes',
  'reads',
  'crashes',
  'fails',
  'redeliveries',
  'drops',
  'bumps',
  'days',
] as const
export type Budget = Record<(typeof BUDGET)[number], number>
export const NO_BUDGET = Object.fromEntries(BUDGET.map((key) => [key, 0])) as Budget

export interface World {
  row: Row
  queue: number
  writesNotEnqueued: number
  day: number
  build: number
  procs: Proc[]
  left: Budget
  staleAnswer: string | null
}

export type ServerBounds = Budget & { consumers: number }

export interface ServerFaults {
  noMovedCheck?: boolean
  noClaim?: boolean
  noRevisionInCurrent?: boolean
  noResend?: boolean
}

export const HOUR = 3_600_000
export const DAY = 24 * HOUR
export const CRASHED_HOLDER = -1
export const TORN_READ = -1
export const IDLE: Proc = {
  pc: 'idle',
  build: 0,
  holdsClaim: false,
  readAt: 0,
  tornRead: false,
  decidedOnHash: null,
  decidedOnThisBuild: false,
  libAtRequest: 0,
  serveAttempt: 0,
}

export function jobRowOf(row: Row, build: number, faults: ServerFaults): JobRow {
  const ahead = faults.noRevisionInCurrent === true ? 0 : row.rev - build
  const stored = row.hash !== null
  return {
    library_version: row.lib,
    lift_revision: 0,
    activity_count: 1,
    computed_version: row.computed,
    snapshot_version: row.version,
    snapshot_lift_revision: 0,
    computed_at: null,
    attempted_at: null,
    snapshot_hash: stored ? `h${row.hash}` : null,
    snapshot_now_ms: stored ? row.day * DAY + HOUR : 0,
    analysis_revision: stored
      ? resultRevisionOf(ANALYSIS_REVISION + ahead, STATE_SNAPSHOT_VERSION, LIFT_REVISION)
      : 0,
    zone: null,
  }
}

// source: state/record.ts claimCompute, `claim_until = 0 OR claim_until <= now - hold`. A read passes the failure hold, the queue none.
export const claimable = (claim: Claim, hold: boolean) =>
  claim === 'released' || claim === 'lapsedPastHold' || (!hold && claim === 'lapsedUnderHold')

// source: state/record.ts releaseClaim, only the stamp the caller holds.
export const release = (row: Row, id: number): Row =>
  row.owner === id ? { ...row, claim: 'released', owner: null } : row

// source: state/record.ts record(): the coverage, then the snapshot moved to a later (revision, version, instant), one batch.
export function record(
  row: Row,
  p: Proc,
  day: number,
  hash: number | null,
  matched: number | null,
): Row {
  const stored = row.hash === null ? -Infinity : row.rev
  const hashOk = matched === null || row.hash === matched
  const v = p.readAt
  const computed =
    stored <= p.build && hashOk
      ? stored === p.build
        ? Math.max(row.computed, v)
        : v
      : row.computed
  const later =
    stored < p.build ||
    (stored === p.build && (row.version < v || (row.version === v && row.day <= day)))
  if (!hashOk || !later) return { ...row, computed }
  return { ...row, computed, hash: hash ?? row.hash, version: v, day, rev: p.build }
}

export function whyServedStale(content: number, rev: number, p: Proc): string | null {
  if (content < p.libAtRequest) return `served v${content} to a read begun at v${p.libAtRequest}`
  const shown = snapshotIsCurrent({
    schemaVersion: STATE_SNAPSHOT_VERSION,
    modelRevision: MODEL_REVISION,
    analysisRevision: ANALYSIS_REVISION + rev - p.build,
    liftRevision: LIFT_REVISION,
  })
  return shown ? null : `served build ${rev}'s snapshot to build ${p.build}`
}

export function showWorld(w: World): string {
  const r = w.row
  const procs = w.procs.map((p) =>
    p.pc === 'idle' ? 'idle' : `${p.pc}${p.holdsClaim ? '*' : ''}@v${p.readAt}`,
  )
  return [
    `lib ${r.lib}, snapshot ${r.hash ?? 'none'} at v${r.version} rev ${r.rev} day ${r.day}, computed ${r.computed}`,
    `claim ${r.claim}${r.owner === null ? '' : ` by ${r.owner}`}${r.messagePending ? ', message pending' : ''}${r.computeBeganRecently ? ', compute began recently' : ''}`,
    `queue ${w.queue}, not enqueued ${w.writesNotEnqueued}, build ${w.build}, day ${w.day}, [${procs.join(', ')}]`,
    ...(w.staleAnswer === null ? [] : [w.staleAnswer]),
  ].join(' | ')
}
