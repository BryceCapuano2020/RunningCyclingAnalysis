/**
 * A small explicit-state model checker. It walks every state a model can reach, breadth first, keyed by the state's JSON, and
 * checks each against the invariants. With `quiescent` it also checks that every reachable state can reach a quiescent one by
 * system actions alone (an `env` action, such as a write, a crash or a lost message, is the world's and a fair run can do
 * without it). A failure carries the shortest trace that shows it. Models stay small: a state is plain data, built with its
 * keys in one order, and the bounds sit in the state (writes left, crashes left), so the walk ends.
 */
export interface Action<S> {
  name: string
  /** An action of the world, not the system: the liveness check looks for a way to quiescence without it. */
  env?: boolean
  /** Every state the action can lead to from `state`; none when its guard does not hold. */
  next: (state: S) => readonly S[]
}

export interface Model<S> {
  init: readonly S[]
  actions: readonly Action<S>[]
  /** Each must hold in every reachable state. */
  invariants: Readonly<Record<string, (state: S) => boolean>>
  /** The states with nothing left to do. */
  quiescent?: (state: S) => boolean
  /** The walk stops with an error past this many states: the bounds are too wide for a unit test. */
  maxStates?: number
}

export interface Step<S> {
  action: string
  state: S
}

export type Verdict<S> =
  | { ok: true; states: number; transitions: number }
  | { ok: false; states: number; transitions: number; broken: string; trace: Step<S>[] }

/** The name a liveness failure carries. */
export const STUCK = 'reaches quiescence'

export function check<S>(model: Model<S>): Verdict<S> {
  const max = model.maxStates ?? 1_000_000
  const index = new Map<string, number>()
  const states: S[] = []
  const parent: number[] = []
  const via: string[] = []
  const back: number[][] = []
  let transitions = 0
  const traceTo = (at: number): Step<S>[] => {
    const steps: Step<S>[] = []
    for (let i = at; i !== -1; i = parent[i]!) steps.unshift({ action: via[i]!, state: states[i]! })
    return steps
  }
  const broken = (name: string, at: number): Verdict<S> => ({
    ok: false,
    states: states.length,
    transitions,
    broken: name,
    trace: traceTo(at),
  })
  // Returns the name of an invariant the new state breaks, or null. Only a system edge is kept for the liveness walk.
  const add = (state: S, from: number, action: Pick<Action<S>, 'name' | 'env'>): string | null => {
    const key = JSON.stringify(state)
    let at = index.get(key)
    const known = at !== undefined
    if (at === undefined) {
      if (states.length >= max) throw new Error(`model check: more than ${max} states`)
      at = states.length
      index.set(key, at)
      states.push(state)
      parent.push(from)
      via.push(action.name)
      back.push([])
    }
    if (from !== -1 && action.env !== true) back[at]!.push(from)
    if (known) return null
    for (const [name, holds] of Object.entries(model.invariants)) if (!holds(state)) return name
    return null
  }
  for (const state of model.init) {
    const name = add(state, -1, { name: 'init' })
    if (name !== null) return broken(name, states.length - 1)
  }
  for (let at = 0; at < states.length; at += 1) {
    for (const action of model.actions) {
      for (const next of action.next(states[at]!)) {
        transitions += 1
        const name = add(next, at, action)
        if (name !== null) return broken(name, states.length - 1)
      }
    }
  }
  if (model.quiescent !== undefined) {
    const reaches = states.map(model.quiescent)
    const queue = reaches.flatMap((yes, i) => (yes ? [i] : []))
    for (let q = 0; q < queue.length; q += 1) {
      for (const from of back[queue[q]!]!) {
        if (!reaches[from]) {
          reaches[from] = true
          queue.push(from)
        }
      }
    }
    // States are numbered in the order the walk found them, so the first one stuck has the shortest trace.
    const stuck = reaches.indexOf(false)
    if (stuck !== -1) return broken(STUCK, stuck)
  }
  return { ok: true, states: states.length, transitions }
}

/** A trace as numbered lines, one per step: the action and the state it led to. */
export function formatTrace<S>(
  trace: readonly Step<S>[],
  show: (state: S) => string = JSON.stringify,
): string {
  return trace.map((step, i) => `${i}. ${step.action}: ${show(step.state)}`).join('\n')
}
