export interface Action<S> {
  name: string
  env?: boolean
  next: (state: S) => readonly S[]
}

export interface Model<S> {
  init: readonly S[]
  actions: readonly Action<S>[]
  invariants: Readonly<Record<string, (state: S) => boolean>>
  quiescent?: (state: S) => boolean
  maxStates?: number
}

export interface Step<S> {
  action: string
  state: S
}

export type Verdict<S> =
  | { ok: true; states: number; transitions: number }
  | { ok: false; states: number; transitions: number; broken: string; trace: Step<S>[] }

export const STUCK = 'reaches quiescence'

export function check<S>(model: Model<S>): Verdict<S> {
  const max = model.maxStates ?? 1_000_000
  const index = new Map<string, number>()
  const states: S[] = []
  const parent: number[] = []
  const via: string[] = []
  const systemPredecessors: number[][] = []
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
  const visitAndCheck = (
    state: S,
    from: number,
    action: Pick<Action<S>, 'name' | 'env'>,
  ): string | null => {
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
      systemPredecessors.push([])
    }
    if (from !== -1 && action.env !== true) systemPredecessors[at]!.push(from)
    if (known) return null
    for (const [name, holds] of Object.entries(model.invariants)) if (!holds(state)) return name
    return null
  }
  for (const state of model.init) {
    const brokenBy = visitAndCheck(state, -1, { name: 'init' })
    if (brokenBy !== null) return broken(brokenBy, states.length - 1)
  }
  for (let at = 0; at < states.length; at += 1) {
    for (const action of model.actions) {
      for (const next of action.next(states[at]!)) {
        transitions += 1
        const brokenBy = visitAndCheck(next, at, action)
        if (brokenBy !== null) return broken(brokenBy, states.length - 1)
      }
    }
  }
  if (model.quiescent !== undefined) {
    const settles = states.map(model.quiescent)
    const queue = settles.flatMap((yes, i) => (yes ? [i] : []))
    for (let q = 0; q < queue.length; q += 1) {
      for (const from of systemPredecessors[queue[q]!]!) {
        if (!settles[from]) {
          settles[from] = true
          queue.push(from)
        }
      }
    }
    const shallowestStuck = settles.indexOf(false)
    if (shallowestStuck !== -1) return broken(STUCK, shallowestStuck)
  }
  return { ok: true, states: states.length, transitions }
}

export function formatTrace<S>(
  trace: readonly Step<S>[],
  show: (state: S) => string = JSON.stringify,
): string {
  return trace.map((step, i) => `${i}. ${step.action}: ${show(step.state)}`).join('\n')
}
