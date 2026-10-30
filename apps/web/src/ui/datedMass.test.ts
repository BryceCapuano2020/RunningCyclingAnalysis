import { describe, expect, it } from 'vitest'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { combine, digestActivity } from '@rca/core/digest'
import type { AnalysisResult } from '@rca/core/pipeline'
import { equivalentRunSpeed } from '@rca/core/pipeline'
import { sampleDataset } from '@rca/core/synthetic'
import type { ActivityDigest, AthleteSettings } from '@rca/core/types'
import { curvePoint } from './charts/fixtures'
import { makeActivity, makeResult } from './components/fixtures'
import { profileEquivalents } from './gradeProfile'
import { bestEffortRows } from './pages/bestEffortRows'
import type { BestEffortInput } from './pages/bestEffortRows'
import { sportGrade } from './grades'
import { sportRecords } from './records'
import { fitRestsOnEstimate } from './thresholdRange'
import { changeOf } from './charts/changeFixtures'

const baseRide = digestActivity(
  sampleDataset().activities.find((activity) => activity.sport === 'ride')!,
)

/** A ride with one measured value, at the headline duration, on a local day. */
function ride(
  id: string,
  day: [number, number, number],
  watts: number,
  powerSource: ActivityDigest['powerSource'] = 'measured',
): ActivityDigest {
  return {
    ...baseRide,
    id,
    name: id,
    startMs: new Date(day[0], day[1] - 1, day[2], 12).getTime(),
    powerSource,
    calibration: null,
    climbSections: [],
    hrBlocks: [],
    curve: baseRide.curve.map((point) =>
      Object.assign({}, point, {
        value: point.durationS === HEADLINE_DURATION_S ? watts : Number.NaN,
        terms: null,
      }),
    ),
  }
}

// 300 W at 90 kg is 3.3 W/kg; 290 W at 80 kg is 3.6 W/kg. The lighter, weaker ride is the best one.
const settings: AthleteSettings = {
  massKg: 80,
  bikeMassKg: 9,
  measurements: [
    { kind: 'massKg', value: 90, from: '2023-01-01' },
    { kind: 'massKg', value: 80, from: '2024-01-01' },
  ],
}
const result = combine(
  [ride('heavy', [2023, 6, 15], 300, 'measured'), ride('light', [2025, 6, 15], 290, 'virtual')],
  settings,
)
const atHeadline = (curve: { durationS: number }[]) =>
  curve.findIndex((point) => point.durationS === HEADLINE_DURATION_S)

describe('a result whose best watts and best power-to-weight are different rides', () => {
  it('shows one ride in the records, with its W/kg at the weight on its day', () => {
    const records = sportRecords(result, 'ride', 80, 'metric')
    const headline = records.find((record) => record.durationS === HEADLINE_DURATION_S)
    expect(headline?.activity?.id).toBe('light')
    expect(headline?.value).toBe('290 W')
    expect(headline?.sub).toBe('3.6 W/kg')
  })

  it('dates the ride’s grade by the ride its running equivalent came from', () => {
    const profile = { birthYear: 1980, sex: 'male' as const }
    const outcome = sportGrade(result, 'ride', HEADLINE_DURATION_S, profile)
    expect(outcome.kind).toBe('graded')
    // 'light' was ridden in 2025, when this athlete is 45; 'heavy' was ridden in 2023, at 43.
    if (outcome.kind === 'graded') expect(outcome.age).toBe(45)
    const equivalent = result.equivalents.find((e) => e.durationS === HEADLINE_DURATION_S)
    expect(equivalent?.ridePowerW).toBeCloseTo(290, 9)
    expect(result.rideCurve[atHeadline(result.rideCurve)]?.activityId).toBe('light')
  })

  it('asks whether the threshold rests on an estimate of the ride it was fitted to', () => {
    // The fitted efforts are those of the best power-to-weight ride, which has a virtual power source.
    const estimated = result.activities.find((a) => a.id === 'light')
    expect(estimated?.powerSource).toBe('virtual')
    expect(fitRestsOnEstimate({ ...result, rideCurve: [curvePoint(1200, 290, 'light')] })).toBe(
      true,
    )
    expect(fitRestsOnEstimate({ ...result, rideCurve: [curvePoint(1200, 300, 'heavy')] })).toBe(
      false,
    )
    expect(fitRestsOnEstimate(result)).toBe(true)
  })
})

describe('profileEquivalents with dated body masses', () => {
  it("prices a ride at the body mass it was ridden at, not at today's", () => {
    const { hr } = makeResult()
    const dated: AnalysisResult = makeResult({
      activities: [makeActivity({ id: 'ride-1', sport: 'ride', massKg: 90 })],
      rideCurve: [curvePoint(5400, 250, 'ride-1')],
      equivalents: [],
      hr,
    })
    const [equivalent] = profileEquivalents(dated, 75, dated.hr)
    expect(equivalent?.ridePowerW).toBe(250)
    expect(equivalent?.runSpeed.p50).toBeCloseTo(equivalentRunSpeed(250, 90, hr).p50, 9)
    expect(equivalent?.runSpeed.p50).not.toBeCloseTo(equivalentRunSpeed(250, 75, hr).p50, 3)
  })
})

describe('best-effort change on the period before, with dated body masses', () => {
  const heavier = makeActivity({
    id: 'new',
    name: 'New ride',
    sport: 'ride',
    powerSource: 'measured',
    massKg: 90,
  })
  const lighter = makeActivity({
    id: 'old',
    name: 'Old ride',
    sport: 'ride',
    powerSource: 'measured',
    massKg: 80,
  })
  const input = (masses: boolean): BestEffortInput => {
    const [now, before] = masses
      ? [heavier, lighter]
      : [
          { ...heavier, massKg: undefined },
          { ...lighter, massKg: undefined },
        ]
    return {
      sport: 'ride',
      result: makeResult({ activities: [now], rideCurve: [curvePoint(1200, 300, 'new')] }),
      previous: { runCurve: [], rideCurve: [curvePoint(1200, 270, 'old')] },
      previousLabel: 'Previous 6 weeks',
      // At one weight the heavier rider's 300 W is a little less, and in watts per kilogram too; without dated weights it is 30 W more.
      change: changeOf(masses ? 'lower' : 'higher'),
      massKg: 90,
      units: 'metric',
      profile: null,
      library: [now, before],
      openedAt: Date.now(),
    }
  }
  const changeAt20 = (masses: boolean) =>
    bestEffortRows(input(masses)).rows.find((row) => row.label === '20 min')?.change

  it('compares the two rides at one weight, so a heavier rider’s extra watts are not a gain', () => {
    // 270 W at 80 kg is 303.75 W at 90 kg, so 300 W at 90 kg is a little less, not 30 W more.
    expect(changeAt20(true)).toBe('4 W less than previous 6 weeks')
  })

  it('compares the watts as they are without dated weights', () => {
    expect(changeAt20(false)).toBe('30 W more than previous 6 weeks')
  })
})
