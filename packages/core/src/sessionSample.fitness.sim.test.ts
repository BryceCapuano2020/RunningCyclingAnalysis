import './test/warmSample'
import { describe, expect, it } from 'vitest'
import { AnalysisSession } from './session'
import { SAMPLE_CLOCK, SAMPLE_REFERENCE_NOW_MS } from './synthetic'

const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS
const SETTINGS = { massKg: 75, bikeMassKg: 9 }

/** The sample's run status on a clock, drawn by the real analysis. */
const runStatus = (clock = SAMPLE_CLOCK) =>
  new AnalysisSession().loadSample(SETTINGS, clock).fitness.run

// Each clock draws a whole season of its own, about a second each, so the sweep lives here and the unit run
// checks one other week and zone.
describe('the sample athlete’s fitness story on other clocks', () => {
  it('tells the same story whatever day of the week, week or time zone it is loaded in', () => {
    const status = runStatus()
    const clocks = [
      { nowMs: SAMPLE_REFERENCE_NOW_MS + 3 * DAY_MS },
      { nowMs: SAMPLE_REFERENCE_NOW_MS + 9 * WEEK_MS, utcOffsetMinutes: () => -480 },
      { nowMs: SAMPLE_REFERENCE_NOW_MS + 30 * WEEK_MS, utcOffsetMinutes: () => 780 },
    ]
    for (const clock of clocks) {
      const other = runStatus(clock)
      expect(other.state).toBe(status.state)
      expect(other.steady).toBe(status.steady)
      // A zone can move a run across a week's edge, so the windows differ a little: the size stays within two points.
      expect(Math.abs(other.change!.value - status.change!.value)).toBeLessThan(0.02)
      expect(other.change!.high).toBeLessThan(0)
    }
  })
})
