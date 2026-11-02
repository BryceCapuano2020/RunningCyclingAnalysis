// @vitest-environment jsdom
import { cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { EffortGate } from '@rca/core/effort'
import { curvePoint } from './charts/fixtures'
import { basisLine } from './components/basisLine'
import { makeActivity, makeResult } from './components/fixtures'
import { heldAction, heldReason, uncheckedNote } from './components/headlineNeed'
import { headlinePick } from './components/pickHeadline'
import { gate, HARD, NO_HEART_RATE, THIN, UNKNOWN } from './effortGateFixtures'
import { heldPick, heldTexts, holdOf } from './resultHold'

afterEach(cleanup)

describe('a best 20 minutes the effort gate did not show hard, on the Balance headline', () => {
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

  it('holds nothing when both bests were hard, and the pick is the pick it always was', () => {
    const result = base(HARD, HARD)
    expect(holdOf(result)).toBeNull()
    expect(heldPick(result).pick).toEqual(headlinePick(result))
    expect(heldPick(result).pick).not.toBeNull()
    expect(basisLine(result)).toBeNull()
  })

  it('holds nothing for a best that was not hard: the pick stands, and the line says what it rests on', () => {
    for (const result of [base(gate(), HARD), base(gate(), gate()), base(HARD, gate())]) {
      expect(holdOf(result)).toBeNull()
      expect(heldPick(result)).toEqual({ hold: null, pick: headlinePick(result) })
      expect(heldPick(result).pick).not.toBeNull()
    }
  })

  it('says which sport’s best was not all-out, or that neither was', () => {
    expect(basisLine(base(gate(), HARD))).toBe(
      "Your run best wasn't all-out, so running could be higher.",
    )
    expect(basisLine(base(HARD, gate()))).toBe(
      "Your ride best wasn't all-out, so cycling could be higher.",
    )
    expect(basisLine(base(gate(), gate()))).toBe('Neither best was all-out.')
  })

  it('says it of a reference that cannot confirm a hard effort as of one that can', () => {
    const habitual = gate({ reference: 'habitual', neededS: null })
    expect(basisLine(base(habitual, HARD))).toBe(
      "Your run best wasn't all-out, so running could be higher.",
    )
  })

  it('says nothing of a best that was only not checked: the comparison is shown with a note beside it', () => {
    for (const result of [base(NO_HEART_RATE, HARD), base(HARD, THIN), base(UNKNOWN, HARD)]) {
      expect(holdOf(result)).toBeNull()
      expect(heldPick(result).pick).not.toBeNull()
      expect(basisLine(result)).toBeNull()
    }
    expect(uncheckedNote(base(NO_HEART_RATE, HARD))).toBe(
      'No heart rate on your best 20 min run, so the effort was not checked. Add a run with heart rate to check it.',
    )
    expect(uncheckedNote(base(HARD, THIN))).toContain('Too few days with heart rate')
    expect(uncheckedNote(base(HARD, HARD))).toBeNull()
    // A sport with no 20 minute effort at all has nothing to check: the note is of a comparison that is shown.
    expect(uncheckedNote(base(UNKNOWN, HARD))).toBeNull()
  })

  it('says both when one best was not hard and the other was not checked', () => {
    const result = base(gate(), NO_HEART_RATE)
    expect(basisLine(result)).toBe("Your run best wasn't all-out, so running could be higher.")
    expect(uncheckedNote(result)).toContain('No heart rate on your best 20 min ride')
  })

  it('leaves a sport with no 20 minute effort to the need, which an effort of that length mends', () => {
    // No ride best of 20 minutes: the pick waits for one, whether the run's best was hard or not.
    const result = { ...base(gate(), UNKNOWN), rideCurve: [], rideCp: null }
    expect(headlinePick(result)).toBeNull()
    expect(heldAction(result, undefined)).toBe('Add one ride of 20 min or more to compare them.')
  })

  it('tells a reader of the energy view or Balance what the hold says, with the precedence of holdOf', () => {
    const result = base(gate(), HARD)
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

  it('never asks for a hard effort, of a sport or of a reference', () => {
    const result = base(gate({ reference: 'habitual', neededS: null }), gate())
    expect(heldReason(result, undefined)).not.toMatch(/hard|reference/)
    expect(heldAction(result, undefined)).not.toMatch(/hard|reference/)
  })

  it('has a seam for a ride that works out to more than a runner can do', () => {
    const result = base(gate(), HARD)
    const hold = holdOf(result, {
      implausibleRide: { text: 'The ride is implausible.', action: 'Check it.' },
    })!
    expect(hold).toEqual({
      reason: 'implausible-ride',
      scope: 'headline',
      sports: ['ride'],
      text: 'The ride is implausible.',
      action: 'Check it.',
    })
  })
})
