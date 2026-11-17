import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { LIFT_REVISION } from '@rca/core/lift'
import {
  ANALYSIS_REVISION,
  STATE_SNAPSHOT_VERSION,
  snapshotIsCurrent,
} from '@rca/core/stateSnapshot'
import { resultRevisionOf } from './resultRevision.ts'
import type { JobRow } from './row.ts'

// What flowModel.ts walks: one account's row and its processes, and the SQL conditions they run, each beside the file it copies.

/** Where a process is. A consumer: `first`, `before` (state/job.ts), `read`, `record` (state/refresh.ts). A read: `row` (routes/state.ts serveState), `read`, `record`. */
export type Pc = 'idle' | 'first' | 'before' | 'row' | 'read' | 'record'

export interface Proc {
  pc: Pc
  /** The Worker build it runs, counted in deploys. */
  build: number
  /** It holds the claim's stamp. */
  held: boolean
  /** The library version its inputs were read at, and whether a write landed during the read. */
  v: number
  torn: boolean
  /** The row it decided on: the stored hash, and whether that snapshot is this build's (the unchanged path). */
  beforeHash: number | null
  beforeSame: boolean
  /** A read's library version when it began (read-your-writes), and its attempt in serveState's loop. */
  start: number
  attempt: number
}

/** claim_until: 0, in its window, lapsed under the failure hold, or lapsed past it (state/record.ts claimCompute). */
export type Claim = 'free' | 'window' | 'lapsed' | 'old'

/** The `users` and `state_jobs` columns the flow reads. A snapshot's hash is the version its digests were read at, -1 when torn. */
export interface Row {
  lib: number
  hash: number | null
  version: number
  day: number
  rev: number
  computed: number
  claim: Claim
  owner: number | null
  pending: boolean
  recent: boolean
}

/** What the world may still do. `dups` covers a duplicate delivery and a message that arrives after its marker lapsed. */
const BUDGET = ['writes', 'reads', 'crashes', 'fails', 'dups', 'drops', 'bumps', 'days'] as const
export type Budget = Record<(typeof BUDGET)[number], number>
export const NO_BUDGET = Object.fromEntries(BUDGET.map((key) => [key, 0])) as Budget

export interface World {
  row: Row
  /** Messages on their way, and writes whose enqueue has not run. */
  queue: number
  sending: number
  day: number
  build: number
  /** The consumers, then one tab's reads. */
  procs: Proc[]
  left: Budget
  /** What a read served wrongly, kept so the trace says it. */
  wrong: string | null
}

export type ServerBounds = Budget & { consumers: number }

/** A guard taken out, to show the checker finds what it guards. */
export interface ServerFaults {
  noMovedCheck?: boolean
  noClaim?: boolean
  noRevisionInCurrent?: boolean
  noResend?: boolean
}

export const HOUR = 3_600_000
export const DAY = 24 * HOUR
export const DEAD = -1
export const IDLE: Proc = {
  pc: 'idle',
  build: 0,
  held: false,
  v: 0,
  torn: false,
  beforeHash: null,
  beforeSame: false,
  start: 0,
  attempt: 0,
}

/** The row as `jobRow` (state/row.ts) reads it, seen by a Worker of `build`: a later build's snapshot reads as a higher revision. */
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

/** source: state/record.ts claimCompute, `claim_until = 0 OR claim_until <= now - hold`. A read passes the failure hold, the queue none. */
export const claimable = (claim: Claim, hold: boolean) =>
  claim === 'free' || claim === 'old' || (!hold && claim === 'lapsed')

/** source: state/record.ts releaseClaim, only the stamp the caller holds. */
export const release = (row: Row, id: number): Row =>
  row.owner === id ? { ...row, claim: 'free', owner: null } : row

/** source: state/record.ts record(): the coverage, then the snapshot moved to a later (revision, version, instant), one batch. */
export function record(
  row: Row,
  p: Proc,
  day: number,
  hash: number | null,
  matched: number | null,
): Row {
  const stored = row.hash === null ? -Infinity : row.rev
  const hashOk = matched === null || row.hash === matched
  const v = p.v
  const computed =
    stored <= p.build && hashOk
      ? stored === p.build
        ? Math.max(row.computed, v)
        : v
      : row.computed
  // Under the claim no two computes overlap, so a later record has a later instant.
  const later =
    stored < p.build ||
    (stored === p.build && (row.version < v || (row.version === v && row.day <= day)))
  if (!hashOk || !later) return { ...row, computed }
  return { ...row, computed, hash: hash ?? row.hash, version: v, day, rev: p.build }
}

/** Why an answer a read gives as current is not: it misses a write made before the read, or this build may not show it. */
export function servedWrong(content: number, rev: number, p: Proc): string | null {
  if (content < p.start) return `served v${content} to a read begun at v${p.start}`
  const shown = snapshotIsCurrent({
    schemaVersion: STATE_SNAPSHOT_VERSION,
    modelRevision: MODEL_REVISION,
    analysisRevision: ANALYSIS_REVISION + rev - p.build,
    liftRevision: LIFT_REVISION,
  })
  return shown ? null : `served build ${rev}'s snapshot to build ${p.build}`
}

/** A world on one line, for a trace: the library, the stored snapshot, the claim, the queue and each process. */
export function showWorld(w: World): string {
  const r = w.row
  const procs = w.procs.map((p) =>
    p.pc === 'idle' ? 'idle' : `${p.pc}${p.held ? '*' : ''}@v${p.v}`,
  )
  return [
    `lib ${r.lib}, snapshot ${r.hash ?? 'none'} at v${r.version} rev ${r.rev} day ${r.day}, computed ${r.computed}`,
    `claim ${r.claim}${r.owner === null ? '' : ` by ${r.owner}`}${r.pending ? ', pending' : ''}${r.recent ? ', recent' : ''}`,
    `queue ${w.queue}, sending ${w.sending}, build ${w.build}, day ${w.day}, [${procs.join(', ')}]`,
    ...(w.wrong === null ? [] : [w.wrong]),
  ].join(' | ')
}
