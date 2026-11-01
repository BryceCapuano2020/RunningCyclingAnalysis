import { describe, expect, it } from 'vitest'
import { plantedLibrary } from '../findings/test/plantedLibrary'
import { copiedLibrary } from '../test/libraryFixture'
import type { ActivityDigest, AthleteSettings } from '../types'
import { lookBackOf } from './compute'
import { milestonesOf } from './milestones'

const SETTINGS: AthleteSettings = { massKg: 70, bikeMassKg: 9 }
const NONE: ReadonlySet<string> = new Set()

function mixed(): { digests: ActivityDigest[] } {
  const run = plantedLibrary({ seed: 31, weeks: 300, perWeek: 4, noise: 0.03, effects: [] })
  const ride = plantedLibrary({
    seed: 32,
    weeks: 300,
    perWeek: 2,
    sports: ['ride'],
    noise: 0.03,
    effects: [],
  })
  return {
    digests: [...run.digests, ...ride.digests].sort((a, b) => a.startMs - b.startMs),
  }
}

describe('milestones read one sport at a time', () => {
  it('give each sport the milestones the two read together give it', () => {
    const { digests } = mixed()
    const both = milestonesOf(digests, SETTINGS)
    const runs = milestonesOf(digests, SETTINGS, undefined, ['run'])
    const rides = milestonesOf(digests, SETTINGS, undefined, ['ride'])

    expect(runs.run).toEqual(both.run)
    expect(rides.ride).toEqual(both.ride)
    expect(runs.ride).toEqual([])
    expect(rides.run).toEqual([])
    expect(both.run.length + both.ride.length).toBeGreaterThan(0)
  })

  it('do so on a library with dated body masses too', () => {
    const { digests } = mixed()
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
    const settings: AthleteSettings = {
      ...SETTINGS,
      measurements: [
        { kind: 'massKg', value: 68, from: day(digests[0]!.startMs) },
        { kind: 'massKg', value: 74, from: day(digests.at(-1)!.startMs - 400 * 86_400_000) },
      ],
    }
    const both = milestonesOf(digests, settings)
    expect(milestonesOf(digests, settings, undefined, ['run']).run).toEqual(both.run)
    expect(milestonesOf(digests, settings, undefined, ['ride']).ride).toEqual(both.ride)
  })

  it('do so on the copied library the session is timed on', () => {
    const digests = copiedLibrary(600)
    const both = milestonesOf(digests, SETTINGS)
    expect(milestonesOf(digests, SETTINGS, undefined, ['run']).run).toEqual(both.run)
    expect(milestonesOf(digests, SETTINGS, undefined, ['ride']).ride).toEqual(both.ride)
  })

  it('leave a run’s milestones as they were when the body mass changes', () => {
    const { digests } = mixed()
    const a = milestonesOf(digests, SETTINGS, undefined, ['run']).run
    const b = milestonesOf(digests, { massKg: 95, bikeMassKg: 12 }, undefined, ['run']).run
    expect(b).toEqual(a)
  })
})

describe('the look-back when the body mass changes', () => {
  it('keeps the years and the runs’ milestones it made, and prices the rides again', () => {
    const { digests } = mixed()
    const before = lookBackOf(digests, SETTINGS, NONE)
    const after = lookBackOf(digests, { massKg: 85, bikeMassKg: 9 }, NONE)

    expect(after).not.toBe(before)
    // The same answers, not copies: nothing about them was worked out again.
    expect(after.sports.run.fitness).toBe(before.sports.run.fitness)
    expect(after.sports.ride.fitness).toBe(before.sports.ride.fitness)
    expect(after.sports.run.milestones).toBe(before.sports.run.milestones)
    expect(after.sports.ride.milestones).not.toBe(before.sports.ride.milestones)
  })
})
