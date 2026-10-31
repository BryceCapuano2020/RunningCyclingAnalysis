import { describe, expect, it } from 'vitest'
import { NO_REFERENCE_SETTINGS } from '../athlete/references'
import type { ReferenceSettings } from '../athlete/references'
import {
  FLOOR_MINIMUM_BPM,
  HABITUAL_MIN_DAYS,
  HABITUAL_PEAK_RATIO,
  HABITUAL_SLACK_BPM,
  HIGH_OVER_PREDICTED_BPM,
  REFERENCE_FLOOR_BPM,
  predictedMaxHeartRate,
  enteredReferences,
  exemptHabitual,
  readReferences,
  referenceFloorBpm,
} from './reference'
import type { ReferenceInput } from './reference'

const days = (share: number, count = HABITUAL_MIN_DAYS) => ({ share, days: count })

function input(over: Partial<ReferenceInput> = {}): ReferenceInput {
  return {
    reference: { run: 190, ride: 184 },
    observedMax: { run: 190, ride: 184 },
    typical: { run: days(0.8), ride: days(0.8) },
    settings: NO_REFERENCE_SETTINGS,
    ageYears: null,
    ...over,
  }
}

describe('the age band', () => {
  it('predicts the maximum as 208 less 0.7 a year, and puts the floor 30 under it, never under 130', () => {
    expect(predictedMaxHeartRate(40)).toBe(180)
    expect(referenceFloorBpm(40)).toBe(150)
    expect(referenceFloorBpm(25)).toBe(161)
    expect(referenceFloorBpm(80)).toBe(FLOOR_MINIMUM_BPM)
    expect(referenceFloorBpm(null)).toBe(REFERENCE_FLOOR_BPM)
  })
})

describe('readReferences', () => {
  it('reads a reference under the floor as low, whatever the days say', () => {
    const low = { run: REFERENCE_FLOOR_BPM - 0.5, ride: null }
    const read = readReferences(
      input({ reference: low, observedMax: low, typical: { run: days(0.7), ride: null } }),
    )
    expect(read.reading).toEqual({ run: 'low', ride: null })
    const edge = { run: REFERENCE_FLOOR_BPM, ride: null }
    expect(
      readReferences(
        input({ reference: edge, observedMax: edge, typical: { run: days(0.7), ride: null } }),
      ).reading.run,
    ).toBe('trusted')
  })

  it('puts the floor by the age when it is known: 155 is low for a 25-year-old and fine for a 60-year-old', () => {
    const at = { run: 155, ride: null }
    const base = { reference: at, observedMax: at, typical: { run: days(0.7), ride: null } }
    expect(readReferences(input({ ...base, ageYears: 25 })).reading.run).toBe('low')
    expect(readReferences(input({ ...base, ageYears: 60 })).reading.run).toBe('trusted')
  })

  it('tests the floor on the sport’s own maximum, not on a reference worked out from the other sport', () => {
    // The ride reference is the run maximum less six, 144, under the floor; the run's own days are fine, so the ride is trusted.
    const run = readReferences(
      input({
        reference: { run: 150, ride: 150 },
        observedMax: { run: 150, ride: 120 },
        typical: { run: days(0.7), ride: days(0.7) },
      }),
    )
    expect(run.reading).toEqual({ run: 'trusted', ride: 'trusted' })
    // Its own maximum under the floor is low, and a ride that takes the run's is low with it, from the run.
    const low = readReferences(
      input({
        reference: { run: 140, ride: 140 },
        observedMax: { run: 140, ride: 120 },
        typical: { run: days(0.7), ride: days(0.7) },
      }),
    )
    expect(low.reading).toEqual({ run: 'low', ride: 'low' })
    expect(low.from).toEqual({ run: 'run', ride: 'run' })
  })

  it('reads a reference whose typical day sits at the line, over twelve days, as habitual', () => {
    expect(
      readReferences(input({ typical: { run: days(HABITUAL_PEAK_RATIO), ride: days(0.8) } }))
        .reading,
    ).toEqual({
      run: 'habitual',
      ride: 'trusted',
    })
    expect(
      readReferences(input({ typical: { run: days(HABITUAL_PEAK_RATIO - 0.01), ride: days(0.8) } }))
        .reading.run,
    ).toBe('trusted')
  })

  it('does not hold a hard-heavy athlete whose reference is within the slack of the age-predicted maximum', () => {
    const typical = { run: days(0.95), ride: days(0.8) }
    // Age 40 predicts 180: a reference of 172 is within 10 bpm of it, 165 is not.
    const near = { run: 180 - HABITUAL_SLACK_BPM + 5, ride: 150 }
    expect(
      readReferences(input({ reference: near, observedMax: near, typical, ageYears: 40 })).reading
        .run,
    ).toBe('trusted')
    const far = { run: 180 - HABITUAL_SLACK_BPM - 5, ride: 150 }
    expect(
      readReferences(input({ reference: far, observedMax: far, typical, ageYears: 40 })).reading
        .run,
    ).toBe('habitual')
    // Without the age the same typical day is habitual either way.
    expect(readReferences(input({ typical })).reading.run).toBe('habitual')
  })

  it('reads a reference far above the age-predicted maximum as high', () => {
    const edge = predictedMaxHeartRate(40) + HIGH_OVER_PREDICTED_BPM
    const at = (run: number) => ({ run, ride: null })
    const read = (run: number) =>
      readReferences(
        input({
          reference: at(run),
          observedMax: at(run),
          typical: { run: days(0.8), ride: null },
          ageYears: 40,
        }),
      ).reading.run
    expect(read(edge)).toBe('trusted')
    expect(read(edge + 1)).toBe('high')
    // Without the age there is no band to be above.
    expect(
      readReferences(input({ reference: at(edge + 20), observedMax: at(edge + 20) })).reading.run,
    ).toBe('trusted')
  })

  it('lets an entered maximum win, as trusted, over every check', () => {
    const settings: ReferenceSettings = { birthYear: null, entered: { run: 188, ride: null } }
    const low = { run: 140, ride: null }
    const read = readReferences(
      input({
        reference: low,
        observedMax: low,
        typical: { run: days(0.99), ride: null },
        settings,
      }),
    )
    expect(read.referenceHr).toEqual({ run: 188, ride: 182 })
    expect(read.reading).toEqual({ run: 'trusted', ride: 'trusted' })
    expect(read.source).toEqual({ run: 'entered', ride: 'entered' })
  })

  it('uses the age-predicted maximum under twelve days with a heart rate, and is thin without an age', () => {
    const thin = { run: days(1, HABITUAL_MIN_DAYS - 1), ride: days(1, 1) }
    const noAge = readReferences(input({ typical: thin }))
    expect(noAge.reading).toEqual({ run: 'thin', ride: 'thin' })
    expect(noAge.referenceHr).toEqual({ run: 190, ride: 184 })
    const aged = readReferences(input({ typical: thin, ageYears: 40 }))
    expect(aged.reading).toEqual({ run: 'trusted', ride: 'trusted' })
    expect(aged.referenceHr).toEqual({ run: 180, ride: 180 })
    expect(aged.source).toEqual({ run: 'age', ride: 'age' })
  })

  it('has nothing for a sport with no heart rate', () => {
    const none = { run: null, ride: null }
    const read = readReferences(input({ reference: none, observedMax: none, typical: none }))
    expect(read.reading).toEqual(none)
    expect(read.referenceHr).toEqual(none)
  })
})

describe('exemptHabitual', () => {
  it('lifts a sport’s habitual reading to trusted, and only that', () => {
    const habitual = readReferences(input({ typical: { run: days(0.95), ride: days(0.95) } }))
    expect(habitual.reading).toEqual({ run: 'habitual', ride: 'habitual' })
    expect(exemptHabitual(habitual, 'ride').reading).toEqual({ run: 'habitual', ride: 'trusted' })
    const low = readReferences(
      input({ reference: { run: 140, ride: 140 }, observedMax: { run: 140, ride: 140 } }),
    )
    expect(exemptHabitual(low, 'ride')).toBe(low)
  })
})

describe('enteredReferences', () => {
  it('uses each sport’s entered maximum as it is, never lifted by the other’s', () => {
    expect(enteredReferences({ run: 186, ride: 190 })).toEqual({ run: 186, ride: 190 })
    expect(enteredReferences({ run: 186, ride: 170 })).toEqual({ run: 186, ride: 170 })
  })

  it('takes the other sport’s for one with none: cycling’s less 6 bpm, running’s as it is', () => {
    expect(enteredReferences({ run: 186, ride: null })).toEqual({ run: 186, ride: 180 })
    expect(enteredReferences({ run: null, ride: 176 })).toEqual({ run: 176, ride: 176 })
    expect(enteredReferences({ run: null, ride: null })).toEqual({ run: null, ride: null })
  })
})
