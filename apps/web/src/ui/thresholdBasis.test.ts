import { describe, expect, it } from 'vitest'
import type { HeartRateRefusal, ThresholdEstimate } from '@rca/core/threshold'
import {
  makeActivity,
  makeResult,
  makeRideThreshold,
  makeRunThreshold,
} from './components/fixtures'
import { formatDayMonth } from './format/date'
import { heartRateLifted, thresholdBasisLine, thresholdDetail } from './thresholdBasis'

/** 4 March, local noon, so the day is the same in any zone the suite runs in. */
const STRONGEST_DAY = new Date(2026, 2, 4, 12).getTime()

/**
 * The efforts a ride estimate rests on: `rides` rides, the strongest a 12 min effort of ride-2, and a power estimate of 15.5,
 * the answer of `estimate` where heart rate did not raise it.
 */
const efforts = (
  rides: number,
  over: Partial<ThresholdEstimate['efforts']['strongest']> = {},
  value = 15.5,
): ThresholdEstimate['efforts'] => ({
  value,
  relativeError: 0.025,
  rides,
  strongest: { activityId: 'ride-2', durationS: 720, estimated: false, ...over },
})

/**
 * A ride estimate of 250 W at 75 kg (15.5 W/kg metabolic) from five rides, the power estimate itself, with heart rate from six
 * efforts that sits under it, so it did not raise it.
 */
function estimate(over: Partial<ThresholdEstimate> = {}): ThresholdEstimate {
  return makeRideThreshold(15.5, {
    low: 14.9,
    high: 16.4,
    efforts: efforts(5),
    heartRate: { value: 15.2, efforts: 6 },
    ...over,
  })
}

/**
 * A run estimate of 16 W/kg gross metabolic from four runs, the strongest a 40 min effort of run-2, which carries no heart rate
 * (a run's threshold is worked out from pace alone).
 */
function runEstimate(over: Partial<ThresholdEstimate> = {}): ThresholdEstimate {
  return makeRunThreshold(16, {
    efforts: {
      value: 16,
      relativeError: 0.03,
      rides: 4,
      strongest: { activityId: 'run-2', durationS: 2400, estimated: false },
    },
    ...over,
  })
}

const runResultOf = (runThreshold: ThresholdEstimate | null) =>
  makeResult({
    activities: [
      makeActivity({ id: 'run-1', sport: 'run' }),
      makeActivity({ id: 'run-2', sport: 'run', startMs: STRONGEST_DAY }),
    ],
    runThreshold,
  })

const resultOf = (rideThreshold: ThresholdEstimate | null) =>
  makeResult({
    activities: [
      makeActivity({ id: 'ride-1', sport: 'ride' }),
      makeActivity({ id: 'ride-2', sport: 'ride', startMs: STRONGEST_DAY }),
    ],
    rideThreshold,
  })

describe('thresholdBasisLine', () => {
  it('says how many runs the run threshold rests on and the strongest effort, with its length and day', () => {
    expect(thresholdBasisLine(runResultOf(runEstimate()), 'run')).toBe(
      `From 4 runs. Strongest: 40 min on ${formatDayMonth(STRONGEST_DAY)}.`,
    )
  })

  it('says one run in the singular, and never adds the ride’s estimated-watts clause to a run', () => {
    const one = runEstimate({
      efforts: {
        value: 16,
        relativeError: 0.03,
        rides: 1,
        strongest: { activityId: 'run-2', durationS: 3600, estimated: true },
      },
    })
    expect(thresholdBasisLine(runResultOf(one), 'run')).toBe(
      `From 1 run. Strongest: 60 min on ${formatDayMonth(STRONGEST_DAY)}.`,
    )
  })

  it('says how many rides the ride threshold rests on and the strongest effort, with its length and day', () => {
    expect(thresholdBasisLine(resultOf(estimate()), 'ride')).toBe(
      `From 5 rides. Strongest: 12 min on ${formatDayMonth(STRONGEST_DAY)}.`,
    )
  })

  it('flags estimated watts on the strongest effort, and only there', () => {
    const virtual = estimate({ efforts: efforts(5, { estimated: true }) })
    expect(thresholdBasisLine(resultOf(virtual), 'ride')).toBe(
      `From 5 rides. Strongest: 12 min on ${formatDayMonth(STRONGEST_DAY)}, on estimated watts.`,
    )
    expect(thresholdBasisLine(resultOf(estimate()), 'ride')).not.toMatch(/estimated/)
  })

  it('says one ride in the singular', () => {
    const one = estimate({ efforts: efforts(1, { durationS: 1200 }) })
    expect(thresholdBasisLine(resultOf(one), 'ride')).toMatch(
      /^From 1 ride\. Strongest: 20 min on /,
    )
  })

  it('names an effort that is not a whole number of minutes the way the records do', () => {
    const odd = estimate({ efforts: efforts(2, { durationS: 195 }) })
    expect(thresholdBasisLine(resultOf(odd), 'ride')).toMatch(/Strongest: 3 min 15 s on /)
  })

  it('leaves the day out, and keeps the rest, where the strongest ride is not in the result', () => {
    const gone = estimate({ efforts: efforts(5, { activityId: 'ride-gone', estimated: true }) })
    expect(thresholdBasisLine(resultOf(gone), 'ride')).toBe(
      'From 5 rides. Strongest: 12 min, on estimated watts.',
    )
  })

  it('is null without an estimate, for a ride and for a run', () => {
    expect(thresholdBasisLine(resultOf(null), 'ride')).toBeNull()
    expect(thresholdBasisLine(runResultOf(null), 'run')).toBeNull()
  })

  it('reads the ride estimate for a ride and the run estimate for a run, never the other', () => {
    // The default result's other sport rests on three activities of its own, not on the five rides or four runs given.
    expect(thresholdBasisLine(resultOf(estimate()), 'run')).toMatch(/^From 3 runs\. /)
    expect(thresholdBasisLine(runResultOf(runEstimate()), 'ride')).toMatch(/^From 3 rides\. /)
  })

  it('carries no hedge and asks for nothing', () => {
    const line = thresholdBasisLine(resultOf(estimate()), 'ride') ?? ''
    expect(line).not.toMatch(/at least|estimated|not all-out|add |need/i)
  })
})

describe('heartRateLifted', () => {
  it('is true when the answer sits above the power estimate, which only a lift leaves it', () => {
    const lifted = { efforts: efforts(5, {}, 15), heartRate: { value: 16.1, efforts: 6 } }
    expect(heartRateLifted(estimate(lifted))).toBe(true)
  })

  it('is false when the answer is the power estimate, and when heart rate was refused', () => {
    expect(heartRateLifted(estimate({ heartRate: { value: 15.5, efforts: 6 } }))).toBe(false)
    expect(heartRateLifted(estimate({ heartRate: { value: 14.9, efforts: 6 } }))).toBe(false)
    const refused = { efforts: efforts(5, {}, 15), heartRate: { refused: 'flat' as const } }
    expect(heartRateLifted(estimate(refused))).toBe(false)
  })
})

describe('thresholdDetail for a ride', () => {
  const detail = (rideThreshold: ThresholdEstimate | null) =>
    thresholdDetail(resultOf(rideThreshold), 'ride', 75, 'metric')
  const METHOD =
    'Worked out from the strongest effort of each ride, scaled to an hour and averaged, with more weight on recent rides and on those near your top, and never under an hour you rode. ' +
    'Heart rate can raise the answer and never lowers it.'

  it('gives the range, the method, and that heart rate raised the answer where it did', () => {
    const lifted = estimate({ efforts: efforts(5, {}, 15), heartRate: { value: 16.1, efforts: 6 } })
    expect(detail(lifted)).toBe(
      `Range 240 to 264 W. ${METHOD} Here it raised the answer, from 6 efforts.`,
    )
  })

  it('does not say heart rate set the answer when it did not raise it', () => {
    const text = detail(estimate({ heartRate: { value: 15.2, efforts: 1 } }))
    expect(text).toBe(
      `Range 240 to 264 W. ${METHOD} Here it did not raise the answer, from 1 effort.`,
    )
    expect(text).not.toMatch(/was used|raised the answer/)
  })

  it('says one plain clause why heart rate was refused, for every reason the estimator gives', () => {
    const why: Record<HeartRateRefusal, string> = {
      'no-heart-rate': 'no ride has both a power meter and heart rate',
      'few-blocks': 'too little steady riding has both heart rate and power',
      stuck: 'your heart rate does not move with power',
      flat: 'your heart rate rises too little with power to read',
      steep: 'your heart rate rises too steeply with power to read',
      'no-efforts': 'no steady effort sat close to your threshold heart rate',
    }
    for (const [refused, clause] of Object.entries(why) as [HeartRateRefusal, string][]) {
      const text = detail(estimate({ heartRate: { refused } }))
      expect(text, refused).toMatch(new RegExp(`Here it was not used: ${clause}\\.$`))
      // One clause, with no ask and no hedge.
      expect(text, refused).not.toMatch(/Add |should|may |might|because/)
    }
  })

  it('says the range as “About” when its ends print the same', () => {
    expect(detail(estimate({ low: 15.5, high: 15.5 }))).toMatch(/^About 250 W\. /)
  })

  it('leaves estimated watts to the basis line', () => {
    const virtual = estimate({ efforts: efforts(5, { estimated: true }) })
    expect(detail(virtual)).not.toMatch(/estimated watts/)
  })

  it('is null without an estimate', () => {
    expect(detail(null)).toBeNull()
  })
})

describe('thresholdDetail for a run', () => {
  const detail = (runThreshold: ThresholdEstimate | null) =>
    thresholdDetail(runResultOf(runThreshold), 'run', 70, 'metric')

  it('gives the range and the method in a run’s words, never under an hour you ran', () => {
    expect(detail(runEstimate())).toBe(
      `Range 4:10 to 4:39 /km. Worked out from the strongest effort of each run, scaled to an hour and averaged, with more weight on recent runs and on those near your top, and never under an hour you ran.`,
    )
  })

  it('says nothing of heart rate, whether the estimate carries one or a refusal', () => {
    const withHeartRate = runEstimate({ heartRate: { value: 17.5, efforts: 6 }, value: 17.5 })
    const refusals: HeartRateRefusal[] = [
      'no-heart-rate',
      'few-blocks',
      'stuck',
      'flat',
      'steep',
      'no-efforts',
    ]
    const texts = [
      detail(withHeartRate),
      ...refusals.map((refused) => detail(runEstimate({ heartRate: { refused } }))),
    ]
    for (const text of texts) {
      expect(text).not.toMatch(/heart rate|not used|raise/i)
    }
  })

  it('is null without an estimate', () => {
    expect(detail(null)).toBeNull()
  })
})
