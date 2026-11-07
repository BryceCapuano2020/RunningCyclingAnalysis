import './test/warmSample'
import { describe, expect, it } from 'vitest'
import { DAY_MS } from './constants'
import { dayOf } from './customRange'
import { digestActivity } from './digest'
import { powerSetAsideIds } from './digest/powerCheck'
import { windowStart } from './period'
import { AnalysisSession } from './session'
import { SAMPLE_CLOCK, sampleDataset } from './synthetic'
import type { ActivityDigest } from './types'
import { setAsideLibrary, SET_ASIDE_SETTINGS } from './zones/test/setAsideLibrary'

const SETTINGS = { massKg: 75, bikeMassKg: 9 }
const DAYS = 42

/**
 * The thresholds of the period before, and the same window picked as a custom period of its own: its analysis's thresholds, which
 * the hero would show for that window. Both come from one library, so any input the reading drops or takes differently shows.
 */
function twoReadings(digests: ActivityDigest[], settings = SETTINGS) {
  const now = new AnalysisSession()
  now.choosePeriod(DAYS)
  const state = now.loadDigests([...digests], settings)
  const start = state.period.startMs!
  const own = new AnalysisSession()
  own.choosePeriod({ from: dayOf(windowStart(start, DAYS, 1)), to: dayOf(start - 1) })
  const window = own.loadDigests([...digests], settings).result!
  return {
    before: state.previousThresholds!,
    window,
    startMs: windowStart(start, DAYS, 1),
    endMs: start,
  }
}

describe('the previous period’s thresholds', () => {
  it('are null for all time, which has no period before', () => {
    const session = new AnalysisSession()
    session.choosePeriod('all')
    expect(session.loadSample(SETTINGS, SAMPLE_CLOCK).previousThresholds).toBeNull()
  })

  it('equal the thresholds of that window picked as a period of its own', () => {
    const digests = sampleDataset().activities.map(digestActivity)
    const { before, window } = twoReadings(digests)
    expect(before.run).not.toBeNull()
    expect(before.run).toEqual(window.runThreshold)
    expect(before.ride).toEqual(window.rideThreshold)
  })

  it('equal them where the library sets a heart rate aside', () => {
    const { digests } = setAsideLibrary()
    const { before, window } = twoReadings(digests, SET_ASIDE_SETTINGS)
    expect(before.run).toEqual(window.runThreshold)
    expect(before.ride).toEqual(window.rideThreshold)
  })

  it('equal them where a ride in that window has its power set aside but keeps its heart rate', () => {
    const digests = sampleDataset().activities.map(digestActivity)
    const first = digests
      .filter((d) => d.sport === 'ride')
      .sort((a, b) => a.startMs - b.startMs)[0]!
    // Moved a month back into the previous window, with ten times the power: beyond what a rider can make, so the check sets
    // its power aside while its heart rate stays.
    const absurd = digests.map((d) =>
      d.id === first.id
        ? Object.assign({}, d, {
            startMs: d.startMs - 30 * DAY_MS,
            curve: d.curve.map((p) => Object.assign({}, p, { value: p.value * 10 })),
          })
        : d,
    )
    expect(powerSetAsideIds(absurd, SETTINGS).has(first.id)).toBe(true)
    const { before, window } = twoReadings(absurd)
    expect(before.ride).toEqual(window.rideThreshold)
    expect(before.run).toEqual(window.runThreshold)
  })
})
