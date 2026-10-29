import { describe, expect, it } from 'vitest'
import { AnalysisSession } from '@rca/core/session'
import type { SessionState } from '@rca/core/session'
import type { Sport } from '@rca/core/types'
import { SAMPLE_REFERENCE_NOW_MS } from '@rca/core/synthetic'
import { gapOfHeadline } from './balanceGap'
import { profileOf } from './durationProfile'
import { headlineGrades } from './grades'
import { LANDING_EXAMPLE } from './landingExample'
import { threshold } from './records'
import { sampleProfileAt } from './sampleAthlete'

const SETTINGS = { massKg: 75, bikeMassKg: 9 }
const SPORTS: Sport[] = ['run', 'ride']

/** The sample as the app loads it, on the fixed reference clock, at each period the control offers. */
const session = new AnalysisSession()
session.loadSample(SETTINGS)
const at = (choice: 'default' | 365 | 'all'): SessionState => session.setRange(choice, SETTINGS)

describe('the sample athlete fills every section of the app', () => {
  it('shows three different libraries at 12 weeks, 12 months and all time', () => {
    const counts = (['default', 365, 'all'] as const).map(
      (choice) => at(choice).result?.activities.length ?? 0,
    )
    expect(counts[0]).toBeGreaterThanOrEqual(40)
    expect(counts[1]).toBeGreaterThan(counts[0]! + 20)
    expect(counts[2]).toBeGreaterThan(counts[1]!)
    const trends = (['default', 365, 'all'] as const).map((choice) => at(choice).trend.length)
    expect(trends[0]).toBeGreaterThan(5)
    expect(trends[1]).toBeGreaterThan(trends[0]! + 20)
    expect(trends[2]).toBeGreaterThan(trends[1]!)
  })

  it('gives the last 12 weeks a previous period to compare with', () => {
    expect(at('default').previous).not.toBeNull()
    expect(at('all').previous).toBeNull()
  })

  it.each(SPORTS)('reports %s output at the same heart rate, week after week', (sport) => {
    const { weeks, change, referenceHeartRate } = at('default').sameHeartRate[sport]
    expect(referenceHeartRate).not.toBeNull()
    expect(weeks.filter((week) => week.fit !== null).length).toBeGreaterThanOrEqual(3)
    expect(change).not.toBeNull()
    expect(change!.relative).toBeGreaterThan(0)
  })

  it.each(SPORTS)('has durability and drift evidence for %s', (sport) => {
    const { durability, drift } = at('default').lateEvidence[sport]
    expect(durability.length).toBeGreaterThan(0)
    expect(drift.length).toBeGreaterThanOrEqual(5)
  })

  it.each(SPORTS)('has enough sessions for a %s stand-out profile', (sport) => {
    const profile = profileOf(at('default').result!, sport)
    expect(profile.status).toBe('ready')
  })

  it('shows a ride that is getting stronger: the weekly best power rises through the season', () => {
    const rides = at('all').trend.flatMap((point) =>
      point.rideWkg === null ? [] : [point.rideWkg],
    )
    const quarter = Math.floor(rides.length / 4)
    const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length
    expect(rides.length).toBeGreaterThan(20)
    expect(mean(rides.slice(-quarter)) / mean(rides.slice(0, quarter))).toBeGreaterThan(1.08)
  })
})

describe('the sample gives one result on every day of a week, and in every week', () => {
  const DAY_MS = 86_400_000

  /** The headline result of the sample loaded `day` days after the reference day. */
  function headlineOn(day: number) {
    const state = new AnalysisSession().loadSample(SETTINGS, {
      nowMs: SAMPLE_REFERENCE_NOW_MS + day * DAY_MS,
    })
    const result = state.result!
    const newest = state.library[0]!.startMs
    const grades = headlineGrades(result, sampleProfileAt(newest))
    return {
      gap: gapOfHeadline(grades),
      run: grades.run,
      ride: grades.ride,
      runPace: threshold(result, 'run', SETTINGS.massKg, 'metric')?.value,
      ridePower: threshold(result, 'ride', SETTINGS.massKg, 'metric')?.value,
    }
  }

  // The season ends on a Sunday that moves by a week at day 1 and day 8 (the reference day is a Sunday): one
  // day on each side of each move, and the far end. The plan itself is checked over all fourteen days in core.
  const days = [1, 7, 8, 13]
  const reference = headlineOn(0)

  it.each(days)('gives the same headline result %i days after the reference day', (day) => {
    expect(headlineOn(day)).toEqual(reference)
  })

  it('is the result the landing example and the share card show', () => {
    expect(reference.gap).toMatchObject(LANDING_EXAMPLE.gap)
    for (const sport of ['run', 'ride'] as const) {
      const outcome = reference[sport]
      if (outcome.kind !== 'graded') throw new Error(`The sample has no ${sport} grade`)
      expect(outcome.grade).toEqual(LANDING_EXAMPLE.grades[sport])
    }
    expect(reference.ridePower).toBe(`${LANDING_EXAMPLE.rideWatts} W`)
  })
})
