// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { EffortGate } from '@rca/core/effort'
import type { LibraryKnowledge } from './analysis/libraryKnowledge'
import { curvePoint } from './charts/fixtures'
import { makeActivity, makeResult } from './components/fixtures'
import { gate, HARD } from './effortGateFixtures'
import { HOLD_ON_ANY_STALE, heldPick, heldTexts, holdOf } from './resultHold'
import type { HoldInputs } from './resultHold'

const curve = [curvePoint(1200, 5, 'a')]
const three = (sport: 'run' | 'ride') =>
  Array.from({ length: 3 }, (_, n) => makeActivity({ id: `${sport}-${n}`, sport }))
const result = (run: EffortGate = HARD, ride: EffortGate = HARD) =>
  makeResult({
    activities: [...three('run'), ...three('ride')],
    runCurve: curve,
    rideCurve: curve,
    effortGate: { run, ride },
  })

const updating = (stale: number, newer = 0, knowledge: LibraryKnowledge = 'present') => ({
  updating: { knowledge, stale, newer },
})
const note = { text: 'because', action: 'do this' }

describe('holdOf: the one order of reasons', () => {
  it('holds nothing when nothing applies', () => {
    expect(holdOf(result())).toBeNull()
    expect(holdOf(null)).toBeNull()
    expect(holdOf(result(), updating(0))).toBeNull()
  })

  it('updating needs no result: a present library with digests held out and nothing to show', () => {
    expect(holdOf(null, updating(3))).toMatchObject({
      reason: 'updating',
      scope: 'results',
      sports: [],
    })
    expect(holdOf(null, updating(0, 2))?.text).toMatch(/newer version/)
    expect(holdOf(null, updating(3, 0, 'empty'))).toBeNull()
    expect(holdOf(null, { updating: { knowledge: 'unknown', stale: 3, newer: 0 } })).toBeNull()
  })

  it('with a result on screen, updating holds only when one stale digest is allowed to hold everything', () => {
    const hold = holdOf(result(), updating(2))
    expect(hold === null).toBe(!HOLD_ON_ANY_STALE)
    // Digests from a newer app never hold results that are showing.
    expect(holdOf(result(), updating(0, 2))).toBeNull()
  })

  it('takes headline reasons in order: partial-import, then implausible-ride', () => {
    // A best that was not hard is no reason: the balance is stated, with a line under it.
    const easy = result(gate(), gate())
    expect(holdOf(easy)).toBeNull()
    const ride: HoldInputs = { implausibleRide: note }
    expect(holdOf(easy, ride)).toMatchObject({ reason: 'implausible-ride', sports: ['ride'] })
    const both: HoldInputs = { ...ride, partialImport: { text: 'partial', action: 'finish it' } }
    expect(holdOf(easy, both)).toMatchObject({ reason: 'partial-import', scope: 'headline' })
  })

  it('puts updating above every other reason, whatever else is on', () => {
    const everything: HoldInputs = {
      ...updating(4),
      partialImport: note,
      implausibleRide: note,
    }
    expect(holdOf(null, everything)?.reason).toBe('updating')
    if (HOLD_ON_ANY_STALE) expect(holdOf(result(gate()), everything)?.reason).toBe('updating')
    else expect(holdOf(result(gate()), everything)?.reason).toBe('partial-import')
  })

  it('holds the pick and carries the hold into the texts, so a surface that is handed the inputs is held', () => {
    const ride: HoldInputs = { implausibleRide: note }
    expect(heldPick(result(), ride).pick).toBeNull()
    expect(heldPick(result()).pick).not.toBeNull()
    expect(heldTexts(result(), undefined, ride)).toMatchObject({
      reason: 'because',
      action: 'do this',
    })
  })
})
