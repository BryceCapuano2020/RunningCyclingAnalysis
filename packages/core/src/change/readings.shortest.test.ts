import { describe, expect, it } from 'vitest'
import { DURATIONS_S } from '../constants'
import { fitBikeModelOver } from '../digest/rideCurves'
import { massesOf } from '../digest/masses'
import { plantedLibrary } from '../findings/test/plantedLibrary'
import type { AthleteSettings } from '../types'
import { dealRatios } from './null'
import { readingsOf } from './readings'

const SETTINGS: AthleteSettings = { massKg: 70, bikeMassKg: 9 }

describe('readings of the longer lengths only', () => {
  it('are the readings the full read gives at those lengths', () => {
    const run = plantedLibrary({ seed: 41, weeks: 80, perWeek: 4, noise: 0.03, effects: [] })
    const ride = plantedLibrary({
      seed: 42,
      weeks: 80,
      perWeek: 3,
      sports: ['ride'],
      noise: 0.03,
      effects: [],
    })
    const digests = [...run.digests, ...ride.digests]
    const bikeModel = fitBikeModelOver(digests, massesOf(SETTINGS)).model
    const full = readingsOf(digests, SETTINGS, bikeModel, null)
    const shortest = 300
    const part = readingsOf(digests, SETTINGS, bikeModel, null, undefined, shortest)
    DURATIONS_S.forEach((durationS, i) => {
      for (const sport of ['run', 'ride'] as const) {
        if (durationS >= shortest) expect(part[sport][i]).toEqual(full[sport][i])
        else expect(part[sport][i]!.values).toEqual([])
      }
    })
    expect(full.run[10]!.values.length).toBeGreaterThan(0)
    expect(full.ride[10]!.values.length).toBeGreaterThan(0)
  })
})

describe('the null deal with a small side', () => {
  it('draws the same ratios from one buffer as from fresh ones', () => {
    const pooled = Float64Array.from({ length: 60 }, (_, i) => 100 - i)
    const once = dealRatios(pooled, 4, 7, 300, 0.5)
    const again = dealRatios(pooled, 4, 7, 300, 0.5)
    expect(Array.from(again)).toEqual(Array.from(once))
    // A deal alone in a buffer already used by others: the marks are clear after each draw.
    expect(Array.from(dealRatios(pooled, 4, 7, 150, 0.5))).toEqual(Array.from(once.slice(0, 150)))
  })
})
