import { describe, expect, it } from 'vitest'
import { check, formatTrace, STUCK } from './modelCheck'
import type { Action, Model } from './modelCheck'

// The checker walks every reachable state breadth first, keyed by its JSON, so a state is plain data with its keys in one
// order and its bounds inside it. An `env` action is the world's: the liveness check looks for a way to quiescence without it.
// Two processes add one to a shared count, each with a read and a write: the classic lost update.
interface Toy {
  count: number
  local: (number | null)[]
  done: number
}

const toy = (atomic: boolean): Model<Toy> => {
  const at = (s: Toy, p: number, value: number | null) =>
    s.local.map((v, i) => (i === p ? value : v))
  const actions: Action<Toy>[] = [0, 1].flatMap((p) => [
    {
      name: `read ${p}`,
      next: (s: Toy) => {
        if (s.local[p] !== null || s.done >= 2) return []
        if (atomic) return [{ ...s, count: s.count + 1, done: s.done + 1 }]
        return [{ ...s, local: at(s, p, s.count) }]
      },
    },
    {
      name: `write ${p}`,
      next: (s: Toy) => {
        const read = s.local[p] ?? null
        return read === null ? [] : [{ count: read + 1, local: at(s, p, null), done: s.done + 1 }]
      },
    },
  ])
  return {
    init: [{ count: 0, local: [null, null], done: 0 }],
    actions,
    invariants: { 'no lost update': (s) => s.local.some((v) => v !== null) || s.count === s.done },
  }
}

describe('check', () => {
  it('passes a model whose invariant holds and counts its states', () => {
    expect(check(toy(true))).toEqual({ ok: true, states: 3, transitions: 4 })
  })

  it('finds the lost update with the shortest trace', () => {
    const verdict = check(toy(false))
    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.broken).toBe('no lost update')
    expect(verdict.trace.map((step) => step.action)).toEqual([
      'init',
      'read 0',
      'read 1',
      'write 0',
      'write 1',
    ])
    expect(formatTrace(verdict.trace, (s) => String(s.count))).toBe(
      '0. init: 0\n1. read 0: 0\n2. read 1: 0\n3. write 0: 1\n4. write 1: 1',
    )
  })

  it('reports an invariant an initial state breaks', () => {
    const verdict = check({ ...toy(true), init: [{ count: 1, local: [null, null], done: 0 }] })
    expect(verdict.ok ? null : verdict.trace.length).toBe(1)
  })

  // A light that a switch (the world's) turns off and only a timer (the system's) turns on again, unless it broke.
  const light = (repairs: boolean): Model<{ on: boolean; broken: boolean }> => ({
    init: [{ on: true, broken: false }],
    actions: [
      { name: 'switch off', env: true, next: (s) => (s.on ? [{ ...s, on: false }] : []) },
      { name: 'break', env: true, next: (s) => (s.broken ? [] : [{ ...s, broken: true }]) },
      {
        name: 'timer',
        next: (s) => (!s.on && (repairs || !s.broken) ? [{ on: true, broken: false }] : []),
      },
    ],
    invariants: {},
    quiescent: (s) => s.on,
  })

  it('checks that every state reaches quiescence without the world', () => {
    expect(check(light(true)).ok).toBe(true)
    const verdict = check(light(false))
    expect(verdict.ok ? null : [verdict.broken, verdict.trace.at(-1)!.state]).toEqual([
      STUCK,
      { on: false, broken: true },
    ])
  })

  it('stops when the bounds are too wide', () => {
    expect(() => check({ ...toy(false), maxStates: 4 })).toThrow('more than 4 states')
  })
})
