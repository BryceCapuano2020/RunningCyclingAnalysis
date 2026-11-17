import { describe, expect, it } from 'vitest'
import { verdictOf } from './flowModel.ts'

// source: state/job.ts, consumer.ts, refresh.ts, record.ts, inputs.ts, resend.ts, enqueue.ts, row.ts and routes/state.ts.
// Each case is small enough for the unit run; flowModel.sim.test.ts walks wider bounds.
// What the model leaves out: time is no clock, so each timer is a flag that passing time clears (a compute began recently, a
// message pending, a claim's phase). A live compute never outlasts its claim's 60 s window. Lifts take the library's paths. The
// daily re-send runs when the queue is quiet; one that runs mid-compute is a redelivery. Every `env` action is the world's: a
// write, a read, a crash, a failure, a redelivery, a lost message, a deploy, a day roll.
describe('the server results flow keeps its invariants and always settles', () => {
  it.each([
    ['two consumers, two writes and two reads', { consumers: 2, writes: 2, reads: 2 }],
    ['a crash and a failed compute', { writes: 2, reads: 1, crashes: 1, fails: 1 }],
    ['a duplicate, a late and a lost message', { writes: 2, reads: 1, redeliveries: 1, drops: 1 }],
    [
      'a deploy that raises the revision, and a day roll',
      { writes: 1, reads: 2, bumps: 1, days: 1 },
    ],
  ])('%s', (_, bounds) => {
    expect(verdictOf(bounds)).toBe('ok')
  })
})

describe('the server model finds each guard taken out', () => {
  const bounds = { writes: 2, reads: 2, bumps: 1, drops: 1 }
  it.each([
    [
      'a torn read (state/inputs.ts InputsMoved)',
      { noMovedCheck: true },
      'a snapshot holds the version it covers',
    ],
    [
      'two computes at once (state/record.ts claimCompute)',
      { noClaim: true },
      'claims are exclusive',
    ],
    [
      'a stale revision as current (state/row.ts isCurrent)',
      { noRevisionInCurrent: true },
      'no read gives a stale snapshot as current',
    ],
  ])('%s', (_, faults, broken) => {
    expect(verdictOf(bounds, faults).split('\n')[0]).toBe(broken)
  })

  it('a lost message is never computed without the daily re-send (state/resend.ts)', () => {
    // Started from an account with a snapshot: a new one is computed by the re-send or its first read alone.
    const found = verdictOf({ writes: 1, drops: 1 }, { noResend: true }, false)
    expect(found.split('\n')[0]).toBe('reaches quiescence')
    expect(found).toMatch(/\. lose: /)
  })
})
