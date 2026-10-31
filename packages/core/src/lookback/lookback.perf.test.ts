import { describe, expect, it } from 'vitest'
import { plantedLibrary } from '../findings/test/plantedLibrary'
import { fitnessStatuses } from '../fitness/compute'
import type { AthleteSettings } from '../types'
import { lookBackOf } from './compute'

/** What the look-back costs on top of the fitness status it shares its runs with: the first time, and then free. */
const SETTINGS: AthleteSettings = { massKg: 70, bikeMassKg: 9 }
const NONE: ReadonlySet<string> = new Set()

describe('the look-back of a long library', () => {
  it('costs under 120 ms more than the fitness status for 13 years of two sports, and nothing the second time', () => {
    const run = plantedLibrary({ seed: 11, weeks: 676, perWeek: 4, noise: 0.03, effects: [] })
    const ride = plantedLibrary({
      seed: 12,
      weeks: 676,
      perWeek: 2,
      sports: ['ride'],
      noise: 0.03,
      effects: [],
    })
    const digests = [...run.digests, ...ride.digests].sort((a, b) => a.startMs - b.startMs)
    const nowMs = Math.max(run.lastMs, ride.lastMs)
    const t0 = performance.now()
    fitnessStatuses(digests, NONE, { nowMs })
    const fitness = performance.now() - t0
    const t1 = performance.now()
    lookBackOf(digests, SETTINGS, NONE, nowMs)
    const first = performance.now() - t1
    const t2 = performance.now()
    lookBackOf(digests, SETTINGS, NONE, nowMs)
    const again = performance.now() - t2
    console.info(
      `${digests.length} activities: fitness ${fitness.toFixed(0)} ms, look-back on top ${first.toFixed(0)} ms, again ${again.toFixed(2)} ms`,
    )
    expect(first).toBeLessThan(120)
    expect(again).toBeLessThan(2)
  })
})
