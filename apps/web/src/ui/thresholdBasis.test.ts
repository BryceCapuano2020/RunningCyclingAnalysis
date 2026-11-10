import { describe, expect, it } from 'vitest'
import type { HeartRateRefusal, ThresholdEstimate } from '@rca/core/threshold'
import {
  makeActivity,
  makeResult,
  makeRideThreshold,
  makeRunThreshold,
} from './components/test/fixtures'
import { formatDayMonth } from './format/date'
import { heartRateLifted, thresholdBasisLine, thresholdProperties } from './thresholdBasis'

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

const rideRows = (rideThreshold: ThresholdEstimate | null) =>
  thresholdProperties(resultOf(rideThreshold), 'ride', 75, 'metric')
const runRows = (runThreshold: ThresholdEstimate | null) =>
  thresholdProperties(runResultOf(runThreshold), 'run', 70, 'metric')
const valueOf = (rows: { label: string; value: unknown }[], label: string) =>
  rows.find((row) => row.label === label)?.value

describe('thresholdProperties for a run', () => {
  it('gives the runs used, the strongest effort with its day, and the range, and nothing of heart rate or power', () => {
    expect(runRows(runEstimate())).toEqual([
      { label: 'Runs used', value: '4' },
      { label: 'Strongest effort', value: `40 min, ${formatDayMonth(STRONGEST_DAY)}` },
      { label: 'Range', value: '4:10\u20134:39 /km' },
    ])
  })

  it('never adds the ride’s estimated-power row to a run, or a heart-rate row, whatever the estimate carries', () => {
    const estimated = runEstimate({
      heartRate: { value: 17.5, efforts: 6 },
      efforts: {
        value: 16,
        relativeError: 0.03,
        rides: 1,
        strongest: { activityId: 'run-2', durationS: 3600, estimated: true },
      },
    })
    const rows = runRows(estimated)
    expect(valueOf(rows, 'Runs used')).toBe('1')
    expect(rows.map((row) => row.label)).toEqual(['Runs used', 'Strongest effort', 'Range'])
  })

  it('is empty without an estimate', () => {
    expect(runRows(null)).toEqual([])
  })
})

describe('thresholdProperties for a ride', () => {
  it('gives the rides used, the strongest effort with its day, the range and what heart rate did', () => {
    expect(rideRows(estimate())).toEqual([
      { label: 'Rides used', value: '5' },
      { label: 'Strongest effort', value: `12 min, ${formatDayMonth(STRONGEST_DAY)}` },
      { label: 'Range', value: '240\u2013264 W' },
      { label: 'Heart rate', value: 'Read, no change, from 6 efforts' },
    ])
  })

  it('says heart rate raised the answer only when it did, and counts one effort in the singular', () => {
    const lifted = estimate({ efforts: efforts(5, {}, 15), heartRate: { value: 16.1, efforts: 6 } })
    expect(valueOf(rideRows(lifted), 'Heart rate')).toBe('Raised it, from 6 efforts')
    const one = estimate({ heartRate: { value: 15.2, efforts: 1 } })
    expect(valueOf(rideRows(one), 'Heart rate')).toBe('Read, no change, from 1 effort')
  })

  it('says “Not used” for every reason heart rate is refused, with no clause', () => {
    const refusals: HeartRateRefusal[] = [
      'no-heart-rate',
      'few-blocks',
      'stuck',
      'flat',
      'steep',
      'no-efforts',
    ]
    for (const refused of refusals) {
      expect(valueOf(rideRows(estimate({ heartRate: { refused } })), 'Heart rate'), refused).toBe(
        'Not used',
      )
    }
  })

  it('flags estimated power on the strongest effort as a row, and only there', () => {
    const virtual = estimate({ efforts: efforts(5, { estimated: true }) })
    expect(valueOf(rideRows(virtual), 'Power')).toBe('Estimated, no power meter')
    expect(valueOf(rideRows(estimate()), 'Power')).toBeUndefined()
  })

  it('says one ride in the singular row value, and names an odd effort length the way the records do', () => {
    const odd = estimate({ efforts: efforts(1, { durationS: 195 }) })
    expect(valueOf(rideRows(odd), 'Rides used')).toBe('1')
    expect(String(valueOf(rideRows(odd), 'Strongest effort'))).toMatch(/^3 min 15 s, /)
  })

  it('leaves the day out, and keeps the rest, where the strongest ride is not in the result', () => {
    const gone = estimate({ efforts: efforts(5, { activityId: 'ride-gone' }) })
    expect(valueOf(rideRows(gone), 'Strongest effort')).toBe('12 min')
  })

  it('gives the range as one figure when its ends print the same', () => {
    expect(valueOf(rideRows(estimate({ low: 15.5, high: 15.5 })), 'Range')).toBe('250 W')
  })

  it('reads the ride estimate for a ride and the run estimate for a run, never the other', () => {
    // The default result's other sport rests on three activities of its own, not on the five rides or four runs given.
    expect(thresholdProperties(resultOf(estimate()), 'run', 70, 'metric')[0]).toEqual({
      label: 'Runs used',
      value: '3',
    })
    expect(thresholdProperties(runResultOf(runEstimate()), 'ride', 75, 'metric')[0]).toEqual({
      label: 'Rides used',
      value: '3',
    })
  })

  it('is empty without an estimate, and no row is a sentence, a hedge or an ask', () => {
    expect(rideRows(null)).toEqual([])
    for (const row of rideRows(estimate())) {
      expect(String(row.value)).not.toMatch(/\. |at least|add |need|because/i)
    }
  })
})

describe('thresholdBasisLine', () => {
  it('is the basis rows as words, and null without an estimate', () => {
    expect(thresholdBasisLine(runResultOf(runEstimate()), 'run')).toBe(
      `Runs used: 4. Strongest effort: 40 min, ${formatDayMonth(STRONGEST_DAY)}.`,
    )
    expect(thresholdBasisLine(runResultOf(null), 'run')).toBeNull()
  })
})
