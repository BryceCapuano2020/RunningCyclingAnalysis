import { describe, expect, it } from 'vitest'
import type { BalanceGap } from '../ui/balanceGap'
import {
  makeActivity,
  makeResult,
  makeRideThreshold,
  makeRunThreshold,
} from '../ui/components/fixtures'
import { curvePoint } from '../ui/charts/fixtures'
import { gate } from '../ui/effortGateFixtures'
import { heldPick } from '../ui/resultHold'
import { hasShareableContent } from './hasShareableContent'

const NO_COMPARISON = { prior: [], calibrated: null }
const GAP: BalanceGap = { centre: 6, low: 4, high: 8, lean: 'run' }

describe('hasShareableContent', () => {
  it('is true once the sports can be compared and a weight is entered', () => {
    expect(hasShareableContent(makeResult(), null, true)).toBe(true)
  })

  it('is true with a grade gap and a headline comparison', () => {
    expect(hasShareableContent(makeResult(), GAP, true)).toBe(true)
  })

  it('is false when the headline is held, however the grade gap reads', () => {
    expect(hasShareableContent(makeResult({ comparison: NO_COMPARISON }), GAP, true)).toBe(false)
  })

  it('is false while a sport has fewer than three activities in the period, even with a gap', () => {
    const thin = makeResult({
      activities: [
        makeActivity({ id: 'run-1', sport: 'run' }),
        ...[1, 2, 3].map((n) => makeActivity({ id: `ride-${n}`, sport: 'ride' })),
      ],
    })
    expect(hasShareableContent(thin, GAP, true)).toBe(false)
  })

  it('is false while no weight is entered, since the balance waits for it', () => {
    expect(hasShareableContent(makeResult(), GAP, false)).toBe(false)
  })

  it('is false with one sport on file, so a one-sport card is never offered', () => {
    expect(
      hasShareableContent(makeResult({ comparison: NO_COMPARISON, rideCp: null }), null, true),
    ).toBe(false)
    expect(
      hasShareableContent(makeResult({ comparison: NO_COMPARISON, runCp: null }), null, true),
    ).toBe(false)
  })

  it('is false when the ride has no threshold, even with a comparison, so no image asks for more', () => {
    expect(hasShareableContent(makeResult({ rideCp: null }), null, true)).toBe(false)
    expect(hasShareableContent(makeResult({ rideCp: null }), GAP, true)).toBe(false)
  })

  it('reads the ride’s threshold from its estimate: a critical-power fit without one does not offer a card', () => {
    const fitOnly = makeResult({ rideThreshold: null })
    expect(fitOnly.rideCp).not.toBeNull()
    expect(hasShareableContent(fitOnly, GAP, true)).toBe(false)
    expect(
      hasShareableContent(makeResult({ rideThreshold: makeRideThreshold(3) }), GAP, true),
    ).toBe(true)
  })

  it('is false when the run has no threshold, even with a comparison', () => {
    expect(hasShareableContent(makeResult({ runCp: null }), GAP, true)).toBe(false)
  })

  it('reads the run’s threshold from its estimate: a critical-power fit without one does not offer a card, and an estimate without a fit does', () => {
    const fitOnly = makeResult({ runThreshold: null })
    expect(fitOnly.runCp).not.toBeNull()
    expect(hasShareableContent(fitOnly, GAP, true)).toBe(false)
    const estimateOnly = makeResult({ runCp: null, runThreshold: makeRunThreshold(16) })
    expect(hasShareableContent(estimateOnly, GAP, true)).toBe(true)
  })

  it('stays false while the run has no estimate, though the balance is stated, and true with it whatever the gate holds', () => {
    // The card shows both thresholds, so a run with no estimate has nothing to put on it; a best that was not hard does not take one away.
    const noEstimate = makeResult({
      runThreshold: null,
      runCurve: [curvePoint(1200, 5, 'a')],
      effortGate: { run: gate(), ride: gate() },
    })
    expect(heldPick(noEstimate).pick).not.toBeNull()
    expect(hasShareableContent(noEstimate, GAP, true)).toBe(false)
    const kept = { ...makeResult(), effortGate: { run: gate(), ride: gate() } }
    expect(hasShareableContent(kept, GAP, true)).toBe(true)
  })

  it('is false when neither a comparison nor a grade gap says how the balance leans', () => {
    expect(hasShareableContent(makeResult({ comparison: NO_COMPARISON }), null, true)).toBe(false)
  })

  it('is false while the ride is at the top of the age tables, since the balance leaves it out', () => {
    const atTop = { rideAtTop: true }
    expect(hasShareableContent(makeResult(), null, true, atTop)).toBe(false)
    expect(hasShareableContent(makeResult(), GAP, true, atTop)).toBe(false)
  })
})
