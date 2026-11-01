import { describe, expect, it } from 'vitest'
import { plantedLibrary } from '../findings/test/plantedLibrary'
import type { Effect } from '../findings/test/plantedLibrary'
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
    fitnessStatuses(digests, NONE)
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

  it('is under 18 KB posted for 12 years of two sports with six efforts and every list at work, and constant in the activities', () => {
    // Steps every 60 weeks in alternating directions fill the episode list, and a break fills the spans.
    const effects: Effect[] = Array.from({ length: 9 }, (_, i) => ({
      type: 'efficiency-shift' as const,
      atWeek: 40 + i * 60,
      size: i % 2 === 0 ? -0.1 : 0.1,
    }))
    const weeks = 624
    const make = (perWeek: number, sports: ('run' | 'ride')[], seed: number) =>
      plantedLibrary({
        seed,
        weeks,
        perWeek,
        sports,
        noise: 0.03,
        effects: [...effects, { type: 'break', atWeek: 300, size: 10 }],
      })
    const posted = (perWeek: number) => {
      const run = make(perWeek, ['run'], 21)
      const ride = make(Math.max(1, perWeek / 2), ['ride'], 22)
      // Run distance bests give a run its other three efforts: 5 km, 10 km and the half marathon.
      const digests = [
        ...run.digests.map((d, i) => ({
          ...d,
          distanceBests: [5000, 10_000, 21_097.5].map((distanceM, k) => ({
            distanceM,
            seconds: Math.round(distanceM * (0.3 + 0.0001 * ((i * 7 + k * 3) % 50))),
          })),
        })),
        ...ride.digests,
      ].sort((a, b) => a.startMs - b.startMs)
      const look = lookBackOf(digests, SETTINGS, NONE, Math.max(run.lastMs, ride.lastMs))
      return { look, activities: digests.length, bytes: JSON.stringify(look).length }
    }
    const small = posted(2)
    const large = posted(4)
    expect(large.look.sports.run.milestones).toHaveLength(5)
    expect(large.look.sports.ride.milestones.length).toBeGreaterThanOrEqual(2)
    console.info(
      `${large.activities} activities: ${large.bytes} bytes; ${small.activities}: ${small.bytes}`,
    )
    expect(large.bytes).toBeLessThan(18_000)
    // The planted sessions have no 60 minute effort, so a run has five efforts and a ride two where a real library can have
    // six and three: the efforts it lacks are costed at the size of the ones it has.
    const { run: r, ride: d } = large.look.sports
    const efforts = r.milestones.length + d.milestones.length
    const each = JSON.stringify([...r.milestones, ...d.milestones]).length / efforts
    expect(large.bytes + (9 - efforts) * each).toBeLessThan(18_000)
    expect(small.bytes).toBeLessThan(18_000)
    // Twice the activities, not twice the bytes.
    expect(large.bytes).toBeLessThan(small.bytes * 1.3)
  })
})
