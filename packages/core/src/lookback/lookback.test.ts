import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { plantedLibrary } from '../test/plantedLibrary'
import { AnalysisSession } from '../session'
import type { AthleteSettings } from '../types'
import { tooShortText } from './copy'
import { lookBackOf, NO_LOOKBACK } from './compute'
import { orderedFor } from '../digest/consumers'
import { ownRideGate } from '../digest/estimatedRide'
import { hasEstimatedRide } from '../records/progression'
import { milestonesOf } from './milestones'
import type { HindsightFitness } from './types'

const SETTINGS: AthleteSettings = { massKg: 70, bikeMassKg: 9 }
const NONE: ReadonlySet<string> = new Set()
const NOISE = { noise: 0.03, noiseModel: { autocorrelation: 0.9, heavyTails: true } }

const library = () =>
  plantedLibrary({
    seed: 7,
    weeks: 260,
    perWeek: 3,
    ...NOISE,
    effects: [{ type: 'efficiency-shift', atWeek: 110, size: -0.2 }],
  })

describe('a library through lookBackOf', () => {
  const planted = library()
  const look = lookBackOf(planted.digests, SETTINGS, NONE)

  it('tells the run years, told through twelve weeks before the newest activity', () => {
    expect(look.horizonMs).toBeLessThan(look.asOfMs - 11 * 7 * DAY_MS)
    expect(look.horizonMs).toBeGreaterThan(look.asOfMs - 13 * 7 * DAY_MS)
    const run = look.sports.run.fitness
    expect(run.kind).toBe('ok')
    const years = run as HindsightFitness
    expect(years.toMs).toBeLessThanOrEqual(look.horizonMs)
    expect(years.levels.length).toBeGreaterThan(1)
    expect(look.sports.run.referenceHr).not.toBeNull()
  })

  it('has milestones for the run, with a best, years oldest first and units', () => {
    const efforts = look.sports.run.milestones
    expect(efforts.length).toBeGreaterThan(0)
    for (const m of efforts) {
      expect(['m/s', 's']).toContain(m.unit)
      expect(m.years.map((y) => y.year)).toEqual([...m.years.map((y) => y.year)].sort())
      const top =
        m.unit === 's'
          ? Math.min(...m.years.map((y) => y.value))
          : Math.max(...m.years.map((y) => y.value))
      expect(m.best.value).toBe(top)
      expect(m.years.filter((y) => y.partial).length).toBeLessThanOrEqual(1)
    }
  })

  it('is remembered for the same digests, and empty for no library', () => {
    expect(lookBackOf(planted.digests, SETTINGS, NONE)).toBe(look)
    expect(lookBackOf([], SETTINGS, NONE)).toBe(NO_LOOKBACK)
  })

  it('is small however long the library: no list past its cap, nothing per week', () => {
    expect(JSON.stringify(look).length).toBeLessThan(18_000)
    const longest = (value: unknown): number =>
      Array.isArray(value)
        ? Math.max(value.length, ...value.map(longest))
        : typeof value === 'object' && value !== null
          ? Math.max(0, ...Object.values(value).map(longest))
          : 0
    expect(longest(look)).toBeLessThanOrEqual(16)
  })

  it('is the session state field, built with the state', () => {
    const state = new AnalysisSession().loadDigests(planted.digests, SETTINGS)
    expect(state.lookBack.sports.run.fitness.kind).toBe('ok')
  })
})

describe('milestones', () => {
  it("are the same with the library's own gate as with none, when no ride is an estimate", () => {
    const planted = plantedLibrary({
      seed: 5,
      weeks: 160,
      perWeek: 4,
      sports: ['run', 'ride'],
      ...NOISE,
      effects: [],
    })
    const ordered = orderedFor('records', planted.digests)
    expect(hasEstimatedRide(ordered)).toBe(false)
    expect(ownRideGate(ordered)).not.toBeNull()
    expect(milestonesOf(planted.digests, SETTINGS)).toEqual(
      milestonesOf(planted.digests, SETTINGS, ownRideGate(ordered)),
    )
  })

  it('compare two complete calendar years by the change test and never the one in progress', () => {
    const planted = plantedLibrary({ seed: 3, weeks: 190, perWeek: 3, ...NOISE, effects: [] })
    const run = milestonesOf(planted.digests, SETTINGS)
    const twenty = run.run.find((m) => m.effort.kind === 'duration' && m.effort.durationS === 1200)
    expect(twenty).toBeDefined()
    const partial = twenty!.years.find((y) => y.partial)?.year
    for (const v of twenty!.verdicts) {
      expect(v.year).not.toBe(partial)
      expect(['higher', 'lower', 'none', 'untested']).toContain(v.verdict)
    }
  })
})

describe('the words', () => {
  it('says a short library lacks steady activities in one line with no counts, for each sport', () => {
    expect(tooShortText('run')).toBe('Not enough steady runs for a fitness history.')
    expect(tooShortText('ride')).toBe('Not enough steady rides for a fitness history.')
    expect(`${tooShortText('run')} ${tooShortText('ride')}`).not.toMatch(/\d/)
  })
})
