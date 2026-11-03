import { describe, expect, it } from 'vitest'
import type { HeartRateRefusal, ThresholdEstimate } from '@rca/core/threshold'
import { makeActivity, makeResult, makeRideThreshold } from './components/fixtures'
import { formatDayMonth } from './format/date'
import { heartRateLifted, thresholdBasisLine, thresholdDetail } from './thresholdBasis'

/** 4 March, local noon, so the day is the same in any zone the suite runs in. */
const STRONGEST_DAY = new Date(2026, 2, 4, 12).getTime()

/** The efforts a ride estimate rests on: `rides` rides, the strongest a 12 min effort of ride-2. */
const efforts = (
  rides: number,
  over: Partial<ThresholdEstimate['efforts']['strongest']> = {},
): ThresholdEstimate['efforts'] => ({
  value: 15,
  relativeError: 0.025,
  rides,
  strongest: { activityId: 'ride-2', durationS: 720, estimated: false, ...over },
})

/**
 * A ride estimate of 250 W at 75 kg (15.5 W/kg metabolic) from five rides, with heart rate from six efforts that sits under the
 * answer, so it did not raise it.
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

const resultOf = (rideThreshold: ThresholdEstimate | null) =>
  makeResult({
    activities: [
      makeActivity({ id: 'ride-1', sport: 'ride' }),
      makeActivity({ id: 'ride-2', sport: 'ride', startMs: STRONGEST_DAY }),
    ],
    rideThreshold,
  })

describe('thresholdBasisLine', () => {
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

  it('is null without an estimate, and for a run, whose fit rests on its curve and not on a count of runs', () => {
    expect(thresholdBasisLine(resultOf(null), 'ride')).toBeNull()
    expect(thresholdBasisLine(resultOf(estimate()), 'run')).toBeNull()
  })

  it('carries no hedge and asks for nothing', () => {
    const line = thresholdBasisLine(resultOf(estimate()), 'ride') ?? ''
    expect(line).not.toMatch(/at least|estimated|not all-out|add |need/i)
  })
})

describe('heartRateLifted', () => {
  it('is true when the heart-rate estimate sits above the answer, which only a lift leaves it', () => {
    expect(heartRateLifted(estimate({ heartRate: { value: 16.1, efforts: 6 } }))).toBe(true)
  })

  it('is false when the heart-rate estimate is at or under the answer, and when heart rate was refused', () => {
    expect(heartRateLifted(estimate({ heartRate: { value: 15.5, efforts: 6 } }))).toBe(false)
    expect(heartRateLifted(estimate({ heartRate: { value: 14.9, efforts: 6 } }))).toBe(false)
    expect(heartRateLifted(estimate({ heartRate: { refused: 'flat' } }))).toBe(false)
  })
})

describe('thresholdDetail for a ride', () => {
  const detail = (rideThreshold: ThresholdEstimate | null) =>
    thresholdDetail(resultOf(rideThreshold), 'ride', 75, 'metric', null)
  const METHOD =
    'Worked out from the strongest effort of each ride, scaled to an hour and averaged, with more weight on recent rides and on those near your top. ' +
    'Heart rate can raise the answer and never lowers it.'

  it('gives the range, the method, and that heart rate raised the answer where it did', () => {
    expect(detail(estimate({ heartRate: { value: 16.1, efforts: 6 } }))).toBe(
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

  it('leaves estimated watts to the basis line, and says nothing of how hard the best 20 min was', () => {
    const virtual = estimate({ efforts: efforts(5, { estimated: true }) })
    expect(detail(virtual)).not.toMatch(/estimated watts/)
    const hard = { durationS: 1200, runHrFraction: 0.95, rideHrFraction: 0.7 }
    const text = thresholdDetail(resultOf(estimate()), 'ride', 75, 'metric', hard)
    expect(text).not.toMatch(/max heart rate|all-out|hard effort/i)
  })

  it('is null without an estimate', () => {
    expect(detail(null)).toBeNull()
  })
})

describe('thresholdDetail for a run', () => {
  const run = makeResult()

  it('names the fit, and adds how hard the best 20 min was by heart rate, where the check can judge', () => {
    const easy = { durationS: 1200, runHrFraction: 0.7, rideHrFraction: null }
    expect(thresholdDetail(run, 'run', 70, 'metric', easy)).toMatch(
      /^Fitted to your best 3 to 20 min efforts\. Your best 20 min running reached 70% of your running max heart rate .*under the 90% that marks a hard effort\.$/,
    )
  })

  it('has nothing to open where heart rate says nothing of the effort: the fit is the Method page’s', () => {
    expect(thresholdDetail(run, 'run', 70, 'metric', null)).toBeNull()
  })

  it('is null without a fit', () => {
    const easy = { durationS: 1200, runHrFraction: 0.7, rideHrFraction: null }
    expect(thresholdDetail(makeResult({ runCp: null }), 'run', 70, 'metric', easy)).toBeNull()
  })
})
