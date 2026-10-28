import { describe, expect, it } from 'vitest'
import { measurementKey } from '@rca/core/athlete'
import {
  MEASUREMENT_LIMITS,
  MeasurementListSchema,
  MeasurementSchema,
  parseMeasurementKey,
} from './measurements.ts'

const run = { kind: 'maxHeartRate', sport: 'run', value: 188, from: '2024-03-01' }

describe('MeasurementSchema', () => {
  it('accepts each kind with the sport it takes', () => {
    for (const entry of [
      { kind: 'massKg', value: 70, from: '2024-03-01' },
      run,
      { kind: 'maxHeartRate', sport: 'ride', value: 180, from: '2024-03-01' },
      { kind: 'thresholdPower', sport: 'ride', value: 250, from: '2024-03-01' },
      { kind: 'thresholdPace', sport: 'run', value: 4.2, from: '2024-03-01' },
    ]) {
      expect(MeasurementSchema.parse(entry)).toEqual(entry)
    }
  })

  it('accepts the limits themselves and refuses a value beyond them', () => {
    for (const [kind, sport] of [
      ['massKg', undefined],
      ['maxHeartRate', 'run'],
      ['thresholdPower', 'ride'],
      ['thresholdPace', 'run'],
    ] as const) {
      const { min, max } = MEASUREMENT_LIMITS[kind]
      const entry = (value: number) => ({ kind, sport, value, from: '2024-03-01' })
      expect(MeasurementSchema.safeParse(entry(min)).success).toBe(true)
      expect(MeasurementSchema.safeParse(entry(max)).success).toBe(true)
      expect(MeasurementSchema.safeParse(entry(min - 0.01)).success).toBe(false)
      expect(MeasurementSchema.safeParse(entry(max + 0.01)).success).toBe(false)
    }
  })

  it('refuses a wrong sport, a missing sport, a bad date and a non-number', () => {
    expect(MeasurementSchema.safeParse({ ...run, sport: undefined }).success).toBe(false)
    expect(
      MeasurementSchema.safeParse({ kind: 'massKg', sport: 'run', value: 70, from: '2024-03-01' })
        .success,
    ).toBe(false)
    expect(MeasurementSchema.safeParse({ ...run, kind: 'thresholdPower' }).success).toBe(false)
    expect(MeasurementSchema.safeParse({ ...run, from: '2024-02-30' }).success).toBe(false)
    expect(MeasurementSchema.safeParse({ ...run, from: '2101-01-01' }).success).toBe(false)
    expect(MeasurementSchema.safeParse({ ...run, value: Number.NaN }).success).toBe(false)
    expect(MeasurementSchema.safeParse({ ...run, value: '188' }).success).toBe(false)
  })

  it('lists entries', () => {
    expect(MeasurementListSchema.parse({ items: [run] }).items).toEqual([run])
  })
})

describe('parseMeasurementKey', () => {
  it('reads the key measurementKey writes', () => {
    for (const entry of [
      { kind: 'massKg', from: '2024-03-01' },
      { kind: 'maxHeartRate', sport: 'ride', from: '2024-03-01' },
      { kind: 'thresholdPace', sport: 'run', from: '2024-03-01' },
    ] as const) {
      expect(parseMeasurementKey(measurementKey(entry))).toEqual(entry)
    }
  })

  it('refuses a key that is not one', () => {
    for (const key of [
      '',
      'massKg',
      'massKg.run.2024-03-01',
      'maxHeartRate.2024-03-01',
      'thresholdPower.run.2024-03-01',
      'bogus.2024-03-01',
      'massKg.2024-13-01',
    ]) {
      expect(parseMeasurementKey(key)).toBeNull()
    }
  })
})
