import { check, formatTrace, type Action, type Model } from '@rca/core/modelCheck'
import { isCurrent, revisionOrder } from './row.ts'
import {
  claimable,
  DAY,
  CRASHED_HOLDER,
  HOUR,
  IDLE,
  NO_BUDGET,
  jobRowOf,
  record,
  release,
  whyServedStale,
  showWorld,
  TORN_READ,
  type Budget,
  type Proc,
  type Row,
  type ServerBounds,
  type ServerFaults,
  type World,
} from './flowModelRow.ts'

export type { ServerBounds, ServerFaults, World } from './flowModelRow.ts'

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
  const send = (w: World, row: Row) => ({
    row: { ...row, messagePending: true },
    queue: w.queue + 1,
  })

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
        if (!isCurrent(row, now(w)) && r.computeBeganRecently) return set(w, id, IDLE, send(w, r))
        return set(w, id, { ...p, pc: 'before' }, { row: { ...r, messagePending: false } })
      case 'before':
      case 'row': {
        const order = revisionOrder(row)
        if (isCurrent(row, now(w))) {
          const staleAnswer = isReader ? whyServedStale(r.hash!, r.rev, p) : null
          return set(w, id, IDLE, { row: release(r, id), staleAnswer })
        }
        if (order === 'newer') return set(w, id, IDLE, { row: release(r, id) })
        let next = r
        if (!p.holdsClaim) {
          if (faults.noClaim !== true && !claimable(r.claim, isReader)) {
            return set(w, id, IDLE, isReader ? {} : send(w, r))
          }
          next = { ...r, claim: 'inWindow', owner: id, computeBeganRecently: true }
        }
        const reading = {
          ...p,
          pc: 'read' as const,
          holdsClaim: true,
          readAt: r.lib,
          decidedOnHash: r.hash,
        }
        return set(w, id, { ...reading, decidedOnThisBuild: order === 'same' }, { row: next })
      }
      case 'read': {
        // source: state/inputs.ts readInputs: a write during the read is InputsMoved.
        const moved = r.lib !== p.readAt
        if (!moved || faults.noMovedCheck === true) {
          return set(w, id, { ...p, pc: 'record', tornRead: moved })
        }
        if (!isReader) return set(w, id, IDLE, { row: release(r, id) })
        // source: routes/state.ts: a moved read stamps its claim again and reads once more; a lost claim serves what is stored.
        if (r.owner !== id) return set(w, id, IDLE)
        const restamped = { ...r, computeBeganRecently: true }
        if (p.serveAttempt === 0)
          return set(w, id, { ...p, pc: 'row', serveAttempt: 1 }, { row: restamped })
        return set(w, id, IDLE, { row: release(restamped, id) })
      }
      case 'record': {
        // source: state/refresh.ts compute: the same hash under this build's revision is the unchanged path.
        const content = p.tornRead ? TORN_READ : p.readAt
        const unchanged = content === p.decidedOnHash && p.decidedOnThisBuild
        const stored = record(r, p, w.day, unchanged ? null : content, unchanged ? content : null)
        const staleAnswer = isReader ? whyServedStale(content, p.build, p) : null
        return set(w, id, IDLE, { row: release(stored, id), staleAnswer })
      }
    }
  }

  function fail(w: World, id: number): World | null {
    if (w.procs[id]!.pc !== 'read') return null
    const r = w.row
    if (id !== reader) return set(w, id, IDLE, send(w, release(r, id)))
    const held: Row = r.owner === id ? { ...r, claim: 'lapsedUnderHold', owner: null } : r
    return set(w, id, IDLE, { row: held })
  }

  function crash(w: World, id: number): World | null {
    const p = w.procs[id]!
    if (p.pc === 'idle') return null
    const row = p.holdsClaim && w.row.owner === id ? { ...w.row, owner: CRASHED_HOLDER } : w.row
    const queue = id === reader ? w.queue : w.queue + 1
    return set(w, id, IDLE, { row, queue })
  }

  type Guard = (w: World) => boolean
  const act = (
    name: string,
    guard: Guard,
    change: (w: World) => Partial<World>,
  ): Action<World> => ({ name, next: (w) => (guard(w) ? [{ ...w, ...change(w) }] : []) })
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
    ['duplicate', 'redeliveries', (w) => w.queue > 0, (w) => ({ queue: w.queue + 1 })],
    [
      'message late',
      'redeliveries',
      (w) => w.queue > 0 && w.row.messagePending,
      (w) => row(w, { messagePending: false }),
    ],
    ['lose', 'drops', (w) => w.queue > 0, (w) => ({ queue: w.queue - 1 })],
    ['deploy', 'bumps', yes, (w) => ({ build: w.build + 1 })],
    ['day roll', 'days', yes, (w) => ({ day: w.day + 1 })],
  ]
  const timers: [string, Guard, Partial<Row>][] = [
    ['30 s pass', (w) => w.row.computeBeganRecently, { computeBeganRecently: false }],
    ['marker lapses', (w) => w.row.messagePending && w.queue === 0, { messagePending: false }],
    [
      'dead claim lapses',
      (w) => w.row.claim === 'inWindow' && w.row.owner === CRASHED_HOLDER,
      { claim: 'lapsedUnderHold', owner: null },
    ],
    ['hold lapses', (w) => w.row.claim === 'lapsedUnderHold', { claim: 'lapsedPastHold' }],
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
      writesNotEnqueued: w.writesNotEnqueued + 1,
    })),
    // source: state/enqueue.ts: claimPending, then the send.
    act(
      'enqueue',
      (w) => w.writesNotEnqueued > 0,
      (w) => ({
        writesNotEnqueued: w.writesNotEnqueued - 1,
        ...(w.row.messagePending ? {} : send(w, w.row)),
      }),
    ),
    env(
      'read',
      'reads',
      (w) => w.procs[reader]!.pc === 'idle',
      (w) => set(w, reader, { ...IDLE, pc: 'row', build: w.build, libAtRequest: w.row.lib }),
    ),
    // source: state/resend.ts resendDirty. It runs when the queue is quiet: one that runs while a consumer works is a duplicate.
    act(
      'daily re-send',
      (w) => {
        const { hash, version, lib, rev, messagePending } = w.row
        const quiet = w.queue === 0 && w.procs.every((p, id) => id === reader || p.pc === 'idle')
        const behind = hash === null || version < lib || rev < w.build
        return (
          quiet &&
          behind &&
          (hash === null || rev <= w.build) &&
          !messagePending &&
          !faults.noResend
        )
      },
      (w) => send(w, w.row),
    ),
    ...queueFaults.map(([name, key, guard, change]) => env(name, key, guard, change)),
    ...timers.map(([name, guard, change]) => act(name, guard, (w) => row(w, change))),
  ]

  const quiescent = (w: World) =>
    w.queue === 0 &&
    w.writesNotEnqueued === 0 &&
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
      claim: 'released',
      owner: null,
      messagePending: false,
      computeBeganRecently: false,
    },
    queue: 0,
    writesNotEnqueued: 0,
    day: 0,
    build: 0,
    procs: ids.map(() => IDLE),
    left,
    staleAnswer: null,
  })
  return {
    init: [start(0), start(null)],
    actions,
    quiescent,
    maxStates: 3_000_000,
    invariants: {
      'claims are exclusive': (w) =>
        w.procs.filter((p) => p.holdsClaim).length <= 1 &&
        w.procs.every((p, id) => !p.holdsClaim || w.row.owner === id),
      'a snapshot holds the version it covers': (w) =>
        w.row.hash === null || w.row.hash === w.row.version,
      'no read gives a stale snapshot as current': (w) => w.staleAnswer === null,
      'computed_version equals library_version at quiescence': (w) =>
        !quiescent(w) || w.row.computed === w.row.lib,
    },
  }
}

const NONE: ServerBounds = { consumers: 1, ...NO_BUDGET }

export function verdictOf(bounds: Partial<ServerBounds>, faults: ServerFaults = {}, fresh = true) {
  const model = serverModel({ ...NONE, ...bounds }, faults)
  const verdict = check(fresh ? model : { ...model, init: model.init.slice(0, 1) })
  return verdict.ok ? 'ok' : `${verdict.broken}\n${formatTrace(verdict.trace, showWorld)}`
}
