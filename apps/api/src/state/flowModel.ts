import { check, formatTrace, type Action, type Model } from '@rca/core/modelCheck'
import { isCurrent, revisionOrder } from './row.ts'
import {
  claimable,
  DAY,
  DEAD,
  HOUR,
  IDLE,
  NO_BUDGET,
  jobRowOf,
  record,
  release,
  servedWrong,
  showWorld,
  type Budget,
  type Proc,
  type Row,
  type ServerBounds,
  type ServerFaults,
  type World,
} from './flowModelRow.ts'

export type { ServerBounds, ServerFaults, World } from './flowModelRow.ts'

/**
 * A model of one account's results on the server, for the checker in @rca/core/modelCheck: writes, the queue and its
 * consumers, GET /api/state's compute on read, the claim, the daily re-send, a deploy that raises the result revision and a
 * day roll. Each step is one D1 statement or batch, so the checker tries every order of them. The decisions are the real
 * functions (`isCurrent`, `revisionOrder`, `snapshotIsCurrent`); each SQL condition is mirrored beside the file it copies.
 * Time is no clock: each timer that matters is a flag that passing time clears (`recent`, `pending`, a claim's phase), and a
 * live compute never outlasts its claim's 60 s window (STATE_CLAIM_SECONDS is longer than the slowest compute). Lifts are
 * left out: a lift write moves `lift_revision` through the same paths as a library write.
 */

export function serverModel(bounds: ServerBounds, faults: ServerFaults = {}): Model<World> {
  const { consumers, ...left } = bounds
  const reader = consumers
  const ids = [...Array(consumers + 1).keys()]
  const set = (w: World, id: number, p: Proc, change: Partial<World> = {}): World => ({
    ...w,
    ...change,
    procs: w.procs.map((q, i) => (i === id ? p : q)),
  })
  const spend = (w: World, key: keyof Budget) => ({ ...w.left, [key]: w.left[key] - 1 })
  const now = (w: World) => w.day * DAY + 2 * HOUR
  /** markPending, then the send (state/consumer.ts). */
  const send = (w: World, row: Row) => ({ row: { ...row, pending: true }, queue: w.queue + 1 })

  /** One step of process `id`, as its program counter says. */
  function step(w: World, id: number): World | null {
    const p = w.procs[id]!
    const r = w.row
    const row = jobRowOf(r, p.build, faults)
    const isReader = id === reader
    switch (p.pc) {
      case 'idle':
        return null
      case 'first':
        // source: state/job.ts runStateJob: a dirty account whose last compute began moments ago waits (deferred).
        if (!isCurrent(row, now(w)) && r.recent) return set(w, id, IDLE, send(w, r))
        return set(w, id, { ...p, pc: 'before' }, { row: { ...r, pending: false } })
      case 'before':
      case 'row': {
        const order = revisionOrder(row)
        if (isCurrent(row, now(w))) {
          const wrong = isReader ? servedWrong(r.hash!, r.rev, p) : null
          return set(w, id, IDLE, { row: release(r, id), wrong })
        }
        if (order === 'newer') return set(w, id, IDLE, { row: release(r, id) })
        let next = r
        if (!p.held) {
          // Lost: the queue sends one delayed message (busy); a read serves what is stored, not as current, or a 202.
          if (faults.noClaim !== true && !claimable(r.claim, isReader)) {
            return set(w, id, IDLE, isReader ? {} : send(w, r))
          }
          next = { ...r, claim: 'window', owner: id, recent: true }
        }
        const reading = { ...p, pc: 'read' as const, held: true, v: r.lib, beforeHash: r.hash }
        return set(w, id, { ...reading, beforeSame: order === 'same' }, { row: next })
      }
      case 'read': {
        // source: state/inputs.ts readInputs: a write during the read is InputsMoved.
        const moved = r.lib !== p.v
        if (!moved || faults.noMovedCheck === true) {
          return set(w, id, { ...p, pc: 'record', torn: moved })
        }
        if (!isReader) return set(w, id, IDLE, { row: release(r, id) })
        // source: routes/state.ts: a moved read stamps its claim again and reads once more; a lost claim serves what is stored.
        if (r.owner !== id) return set(w, id, IDLE)
        const restamped = { ...r, recent: true }
        if (p.attempt === 0) return set(w, id, { ...p, pc: 'row', attempt: 1 }, { row: restamped })
        return set(w, id, IDLE, { row: release(restamped, id) })
      }
      case 'record': {
        // source: state/refresh.ts compute: the same hash under this build's revision is the unchanged path.
        const content = p.torn ? -1 : p.v
        const unchanged = content === p.beforeHash && p.beforeSame
        const stored = record(r, p, w.day, unchanged ? null : content, unchanged ? content : null)
        const wrong = isReader ? servedWrong(content, p.build, p) : null
        return set(w, id, IDLE, { row: release(stored, id), wrong })
      }
    }
  }

  /** A compute that throws: the queue frees its claim and retries its message; a read holds the claim (routes/state.ts holdClaim). */
  function fail(w: World, id: number): World | null {
    if (w.procs[id]!.pc !== 'read') return null
    const r = w.row
    if (id !== reader) return set(w, id, IDLE, send(w, release(r, id)))
    const held: Row = r.owner === id ? { ...r, claim: 'lapsed', owner: null } : r
    return set(w, id, IDLE, { row: held })
  }

  /** A compute killed mid-run: its stamp stays until the window lapses, and the queue delivers its message again. */
  function crash(w: World, id: number): World | null {
    const p = w.procs[id]!
    if (p.pc === 'idle') return null
    const row = p.held && w.row.owner === id ? { ...w.row, owner: DEAD } : w.row
    const queue = id === reader ? w.queue : w.queue + 1
    return set(w, id, IDLE, { row, queue })
  }

  type Guard = (w: World) => boolean
  const act = (
    name: string,
    guard: Guard,
    change: (w: World) => Partial<World>,
  ): Action<World> => ({ name, next: (w) => (guard(w) ? [{ ...w, ...change(w) }] : []) })
  /** A world action, while its budget lasts: `change` gives the new world, or null when the action cannot run. */
  const env = (
    name: string,
    key: keyof Budget,
    guard: Guard,
    change: (w: World) => Partial<World> | null,
  ): Action<World> => ({
    name,
    env: true,
    next: (w) => {
      const next = w.left[key] > 0 && guard(w) ? change(w) : null
      return next === null ? [] : [{ ...w, ...next, left: spend(w, key) }]
    },
  })
  const row = (w: World, change: Partial<Row>) => ({ row: { ...w.row, ...change } })
  const yes = () => true
  const queueFaults: [string, keyof Budget, Guard, (w: World) => Partial<World>][] = [
    ['duplicate', 'dups', (w) => w.queue > 0, (w) => ({ queue: w.queue + 1 })],
    [
      'message late',
      'dups',
      (w) => w.queue > 0 && w.row.pending,
      (w) => row(w, { pending: false }),
    ],
    ['lose', 'drops', (w) => w.queue > 0, (w) => ({ queue: w.queue - 1 })],
    ['deploy', 'bumps', yes, (w) => ({ build: w.build + 1 })],
    ['day roll', 'days', yes, (w) => ({ day: w.day + 1 })],
  ]
  const timers: [string, Guard, Partial<Row>][] = [
    ['30 s pass', (w) => w.row.recent, { recent: false }],
    ['marker lapses', (w) => w.row.pending && w.queue === 0, { pending: false }],
    [
      'dead claim lapses',
      (w) => w.row.claim === 'window' && w.row.owner === DEAD,
      { claim: 'lapsed', owner: null },
    ],
    ['hold lapses', (w) => w.row.claim === 'lapsed', { claim: 'old' }],
  ]
  const actions: Action<World>[] = [
    ...ids.flatMap((id) => [
      { name: `step ${id}`, next: (w: World) => [step(w, id)].filter((s) => s !== null) },
      env(`fail ${id}`, 'fails', yes, (w) => fail(w, id)),
      env(`crash ${id}`, 'crashes', yes, (w) => crash(w, id)),
    ]),
    ...ids.slice(0, consumers).map((id) =>
      act(
        `deliver to ${id}`,
        (w) => w.queue > 0 && w.procs[id]!.pc === 'idle',
        (w) => set(w, id, { ...IDLE, pc: 'first', build: w.build }, { queue: w.queue - 1 }),
      ),
    ),
    env('write', 'writes', yes, (w) => ({
      ...row(w, { lib: w.row.lib + 1 }),
      sending: w.sending + 1,
    })),
    // source: state/enqueue.ts: claimPending, then the send.
    act(
      'enqueue',
      (w) => w.sending > 0,
      (w) => ({ sending: w.sending - 1, ...(w.row.pending ? {} : send(w, w.row)) }),
    ),
    env(
      'read',
      'reads',
      (w) => w.procs[reader]!.pc === 'idle',
      (w) => set(w, reader, { ...IDLE, pc: 'row', build: w.build, start: w.row.lib }),
    ),
    // source: state/resend.ts resendDirty. It runs when the queue is quiet: one that runs while a consumer works is a duplicate.
    act(
      'daily re-send',
      (w) => {
        const { hash, version, lib, rev, pending } = w.row
        const quiet = w.queue === 0 && w.procs.every((p, id) => id === reader || p.pc === 'idle')
        const behind = hash === null || version < lib || rev < w.build
        return quiet && behind && (hash === null || rev <= w.build) && !pending && !faults.noResend
      },
      (w) => send(w, w.row),
    ),
    // The queue's faults, a deploy and a day roll, while each budget lasts.
    ...queueFaults.map(([name, key, guard, change]) => env(name, key, guard, change)),
    // Time passing, which a fair run allows: each timer's guard, and what it changes.
    ...timers.map(([name, guard, change]) => act(name, guard, (w) => row(w, change))),
  ]

  const quiescent = (w: World) =>
    w.queue === 0 &&
    w.sending === 0 &&
    w.procs.every((p) => p.pc === 'idle') &&
    w.row.hash !== null &&
    w.row.version >= w.row.lib &&
    w.row.rev === w.build
  const start = (hash: number | null): World => ({
    row: {
      lib: 0,
      hash,
      version: 0,
      day: 0,
      rev: 0,
      computed: 0,
      claim: 'free',
      owner: null,
      pending: false,
      recent: false,
    },
    queue: 0,
    sending: 0,
    day: 0,
    build: 0,
    procs: ids.map(() => IDLE),
    left,
    wrong: null,
  })
  return {
    // An account with a current snapshot, and a new one with none.
    init: [start(0), start(null)],
    actions,
    quiescent,
    maxStates: 3_000_000,
    invariants: {
      'claims are exclusive': (w) =>
        w.procs.filter((p) => p.held).length <= 1 &&
        w.procs.every((p, id) => !p.held || w.row.owner === id),
      'a snapshot holds the version it covers': (w) =>
        w.row.hash === null || w.row.hash === w.row.version,
      'no read gives a stale snapshot as current': (w) => w.wrong === null,
      'computed_version equals library_version at quiescence': (w) =>
        !quiescent(w) || w.row.computed === w.row.lib,
    },
  }
}

const NONE: ServerBounds = { consumers: 1, ...NO_BUDGET }

/** 'ok', or the invariant broken and the shortest trace to it. `fresh: false` starts from an account with a snapshot only. */
export function verdictOf(bounds: Partial<ServerBounds>, faults: ServerFaults = {}, fresh = true) {
  const model = serverModel({ ...NONE, ...bounds }, faults)
  const verdict = check(fresh ? model : { ...model, init: model.init.slice(0, 1) })
  return verdict.ok ? 'ok' : `${verdict.broken}\n${formatTrace(verdict.trace, showWorld)}`
}
