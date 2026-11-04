import { describe, expect, it } from 'vitest'
import { EQUIVALENCE_DURATIONS_S, PROFILE_DURATIONS_S } from '../constants'
import { analyze, equivalentRunSpeed } from '../pipeline'
import { sampleDataset } from '../synthetic'
import { profileEquivalents } from './equivalents'

const MASS_KG = 75
const { activities } = sampleDataset()
const result = analyze(activities, { massKg: MASS_KG, bikeMassKg: 9 })
const beyond = (durationS: number) => !EQUIVALENCE_DURATIONS_S.includes(durationS)

describe('profileEquivalents', () => {
  it('prices an equivalent at each longer or shorter duration the ride curve has a best at', () => {
    const extras = profileEquivalents(result, MASS_KG, 'male')
    const ridden = PROFILE_DURATIONS_S.filter(beyond).filter((durationS) =>
      result.rideCurve.some((p) => p.durationS === durationS && Number.isFinite(p.value)),
    )
    expect(ridden.length).toBeGreaterThan(0)
    expect(extras.map((e) => e.durationS)).toEqual(ridden)
  })

  it('prices them as a combine does: the anchored equivalence at the mass', () => {
    for (const extra of profileEquivalents(result, MASS_KG, 'male')) {
      expect(extra.runSpeed).toEqual(equivalentRunSpeed(extra.ridePowerW, MASS_KG, 'male'))
    }
  })

  it('prices them for the athlete’s sex, the anchor the result’s own equivalents use', () => {
    const woman = profileEquivalents(result, MASS_KG, 'female')
    const man = profileEquivalents(result, MASS_KG, 'male')
    expect(woman.length).toBeGreaterThan(0)
    for (const extra of woman) {
      expect(extra.runSpeed).toEqual(equivalentRunSpeed(extra.ridePowerW, MASS_KG, 'female'))
    }
    expect(woman.map((e) => e.runSpeed.p50)).not.toEqual(man.map((e) => e.runSpeed.p50))
  })

  it('prices none a combine already holds, and leaves the result’s own equivalents as they were', () => {
    const before = structuredClone(result.equivalents)
    const held = result.equivalents.map((e) => e.durationS)
    expect(
      profileEquivalents(result, MASS_KG, 'male').some((e) => held.includes(e.durationS)),
    ).toBe(false)
    expect(result.equivalents).toEqual(before)
  })

  it('prices them at the mass given, so the same watts are worth a slower run for a heavier athlete', () => {
    const light = profileEquivalents(result, 60, 'male')[0]!
    const heavy = profileEquivalents(result, 90, 'male')[0]!
    expect(heavy.runSpeed.p50).toBeLessThan(light.runSpeed.p50)
  })

  it('prices nothing when the ride curve has no best beyond the combine’s durations', () => {
    expect(profileEquivalents({ ...result, rideCurve: [] }, MASS_KG, 'male')).toEqual([])
  })

  it('prices a ride at the body mass it was ridden at, not at today’s', () => {
    const durationS = PROFILE_DURATIONS_S.find(beyond)!
    const dated = {
      equivalents: [],
      rideCurve: [{ durationS, value: 250, activityId: 'ride-1', startIndex: 0 }],
      activities: [{ id: 'ride-1', massKg: 90 }],
    }
    const [equivalent] = profileEquivalents(dated, MASS_KG, 'male')
    expect(equivalent?.ridePowerW).toBe(250)
    expect(equivalent?.runSpeed.p50).toBeCloseTo(equivalentRunSpeed(250, 90, 'male').p50, 9)
    expect(equivalent?.runSpeed.p50).not.toBeCloseTo(
      equivalentRunSpeed(250, MASS_KG, 'male').p50,
      3,
    )
  })
})
