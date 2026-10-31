import { describe, expect, it } from 'vitest'
import { referenceSettingsOf, sameAnalysisSettings, sameReferenceSettings } from './references'
import type { Measurement } from './measurements'
import type { AthleteSettings } from './settings'

const BASE: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const max = (sport: 'run' | 'ride', value: number, from: string): Measurement => ({
  kind: 'maxHeartRate',
  sport,
  value,
  from,
})
const AT = new Date(2025, 5, 1, 12).getTime()

describe('referenceSettingsOf', () => {
  it('has the year of birth and the maximum entered for each sport in effect at the instant', () => {
    const settings: AthleteSettings = {
      ...BASE,
      birthYear: 1985,
      measurements: [
        max('run', 185, '2020-01-01'),
        max('run', 182, '2025-01-01'),
        max('run', 179, '2026-01-01'),
        max('ride', 176, '2020-01-01'),
      ],
    }
    expect(referenceSettingsOf(settings, AT)).toEqual({
      birthYear: 1985,
      entered: { run: 182, ride: 176 },
    })
  })

  it('has nothing where none is given, or the instant is not one', () => {
    expect(referenceSettingsOf(BASE, AT)).toEqual({
      birthYear: null,
      entered: { run: null, ride: null },
    })
    expect(
      referenceSettingsOf({ ...BASE, measurements: [max('run', 185, '2020-01-01')] }, Number.NaN)
        .entered,
    ).toEqual({ run: null, ride: null })
  })
})

describe('sameAnalysisSettings', () => {
  const entered = { ...BASE, measurements: [max('run', 185, '2020-01-01')] }

  it('is the same for settings that give every activity the same masses and the reference the same inputs', () => {
    expect(
      sameAnalysisSettings(entered, { ...entered, measurements: [...entered.measurements] }),
    ).toBe(true)
    expect(sameAnalysisSettings(BASE, { ...BASE, measurements: [] })).toBe(true)
  })

  it('differs when a maximum is entered, changed, or the year of birth is given', () => {
    expect(sameReferenceSettings(BASE, entered)).toBe(false)
    expect(
      sameAnalysisSettings(entered, { ...BASE, measurements: [max('run', 186, '2020-01-01')] }),
    ).toBe(false)
    expect(sameAnalysisSettings(BASE, { ...BASE, birthYear: 1985 })).toBe(false)
  })

  it('does not differ for a threshold, which no analysis reads', () => {
    const threshold: Measurement = {
      kind: 'thresholdPower',
      sport: 'ride',
      value: 250,
      from: '2025-01-01',
    }
    expect(sameAnalysisSettings(BASE, { ...BASE, measurements: [threshold] })).toBe(true)
  })

  it('differs when a mass differs, as before', () => {
    expect(sameAnalysisSettings(BASE, { ...BASE, massKg: 80 })).toBe(false)
  })
})
