// @vitest-environment jsdom
import { cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { EffortGate } from '@rca/core/effort'
import { curvePoint } from './charts/fixtures'
import { makeActivity, makeResult } from './components/fixtures'
import { heldAction, heldReason, uncheckedNote } from './components/headlineNeed'
import { headlinePick } from './components/pickHeadline'
import { gate, HARD, NO_HEART_RATE, THIN, UNKNOWN } from './effortGateFixtures'
import { heldPick, heldTexts, holdOf } from './resultHold'

afterEach(cleanup)

describe('the hold on the Balance headline', () => {
  const curve = [curvePoint(1200, 5, 'a')]
  const three = (sport: 'run' | 'ride') =>
    Array.from({ length: 3 }, (_, n) => makeActivity({ id: `${sport}-${n}`, sport }))
  const base = (run: EffortGate, ride: EffortGate) =>
    makeResult({
      activities: [...three('run'), ...three('ride')],
      runCurve: curve,
      rideCurve: curve,
      effortGate: { run, ride },
    })

  it('holds nothing when both best 20 minutes were hard, and the pick is the pick it always was', () => {
    const result = base(HARD, HARD)
    expect(holdOf(result)).toBeNull()
    expect(heldPick(result).pick).toEqual(headlinePick(result))
    expect(heldPick(result).pick).not.toBeNull()
  })

  it('holds a sport that was not a hard effort, naming it, while the pick itself stays pure', () => {
    const result = base(gate(), HARD)
    expect(headlinePick(result)).not.toBeNull()
    const hold = holdOf(result)!
    expect(hold).toMatchObject({ reason: 'effort', sports: ['run'] })
    expect(hold.text).toBe(
      'Your best 20 min run was not a hard effort: it reached 80% of your running reference heart rate, under the 90% that marks a hard effort.',
    )
    expect(hold.action).toBe(
      'Add a 20 min run reaching 90% of your reference heart rate to compare them.',
    )
    expect(heldPick(result)).toEqual({ hold, pick: null })
  })

  it('does not hold a sport whose effort was not checked: the comparison is shown with a note beside it', () => {
    expect(holdOf(base(NO_HEART_RATE, HARD))).toBeNull()
    expect(holdOf(base(HARD, THIN))).toBeNull()
    expect(heldPick(base(NO_HEART_RATE, HARD)).pick).not.toBeNull()
    expect(uncheckedNote(base(NO_HEART_RATE, HARD))).toBe(
      'Effort not checked: no heart rate on your best 20 min run. Add a run with heart rate to check it.',
    )
    expect(uncheckedNote(base(HARD, THIN))).toContain('too few days with heart rate')
    expect(uncheckedNote(base(HARD, HARD))).toBeNull()
    // A sport with no 20 minute effort at all has nothing to check: the note is of a comparison that is shown.
    expect(uncheckedNote(base(UNKNOWN, HARD))).toBeNull()
  })

  it('holds a sport not shown hard and notes the other that was not checked', () => {
    const held = holdOf(base(gate(), NO_HEART_RATE))!
    expect(held.sports).toEqual(['run'])
    expect(uncheckedNote(base(gate(), NO_HEART_RATE))).toContain(
      'no heart rate on your best 20 min ride',
    )
  })

  it('tells a reader of the energy view or Balance what the hold says, with the precedence of holdOf', () => {
    const result = base(gate(), HARD)
    const effort = heldTexts(result, undefined)
    expect(effort.hold?.reason).toBe('effort')
    expect(effort.reason).toContain('Your best 20 min run was not a hard effort')
    expect(effort.action).toBe(
      'Add a 20 min run reaching 90% of your reference heart rate to compare them.',
    )
    const ride = heldTexts(result, undefined, {
      implausibleRide: { text: 'The ride is implausible.', action: 'Check it.' },
    })
    expect([ride.reason, ride.action, ride.hold?.reason]).toEqual([
      'The ride is implausible.',
      'Check it.',
      'implausible-ride',
    ])
    // Too few activities is said first, as before: an effort cannot be asked of a sport with too little on file.
    const few = heldTexts(
      makeResult({ activities: [makeActivity({ id: 'r', sport: 'run' })] }),
      undefined,
    )
    expect(few.hold).toBeNull()
    expect(few.action).toBe('Add 2 more runs and 3 more rides to compare them.')
  })

  it('does not ask for a harder effort of a reference that cannot be trusted', () => {
    const hold = holdOf(base(gate({ reference: 'habitual', neededS: null }), HARD))!
    expect(hold.text).toContain('cannot be called hard')
    expect(hold.action).toBe(
      'Set your max heart rate in Profile, or reach hard heart rates on several days.',
    )
    expect(hold.action).not.toContain('Add a hard')
  })

  it('says what lifts it for each sport, in one sentence', () => {
    const both = base(gate(), gate())
    expect(heldReason(both, undefined)).toContain('Your best 20 min run was not a hard effort')
    expect(heldReason(both, undefined)).toContain('Your best 20 min ride was not a hard effort')
    expect(heldAction(both, undefined)).toBe(
      'Add a 20 min run and a 20 min ride, each reaching 90% of your reference heart rate to compare them.',
    )
    // A sport with no 20 minute effort at all is asked for one, beside the sport that needs a hard one.
    const mixed = { ...base(gate(), HARD), rideCurve: [], rideCp: null }
    expect(heldAction(mixed, undefined)).toBe(
      'Add a 20 min run reaching 90% of your reference heart rate and one ride of 20 min or more to compare them.',
    )
  })

  it('has a seam for a ride that works out to more than a runner can do, above the effort', () => {
    const result = base(gate(), HARD)
    const hold = holdOf(result, {
      implausibleRide: { text: 'The ride is implausible.', action: 'Check it.' },
    })!
    expect(hold).toEqual({
      reason: 'implausible-ride',
      sports: ['ride'],
      text: 'The ride is implausible.',
      action: 'Check it.',
    })
  })
})
