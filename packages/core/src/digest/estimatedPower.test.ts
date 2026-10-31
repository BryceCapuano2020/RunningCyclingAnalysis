import { describe, expect, it } from 'vitest'
import { ridePowerCeilingWkg } from '../curves'
import { activitySummaries, combine } from './combine'
import { estimatedPowerOver } from './estimatedPower'
import { fixedMasses, massesOf } from './masses'
import { powerCheckOf } from './powerCheck'
import { ride, SETTINGS } from './test/estimatedRideFixture'

const BODY_KG = 70
const masses = fixedMasses(BODY_KG, 9)

/** Watts a 70 kg rider needs for `wkg` per kilo. */
const watts = (wkg: number) => wkg * BODY_KG

describe('estimated power over what riders hold (a ride without a meter)', () => {
  const over = (durationS: number) => ridePowerCeilingWkg(durationS)

  it('finds the effort furthest over the ceiling, and what it needs', () => {
    const fast = ride('fast', 0, 'virtual', {
      300: { watts: watts(over(300) * 1.1), heartRate: 150 },
      1200: { watts: watts(over(1200) * 1.3), heartRate: 150 },
    })
    const found = estimatedPowerOver(fast, masses)
    expect(found?.durationS).toBe(1200)
    expect(found?.wkg).toBeCloseTo(over(1200) * 1.3, 6)
  })

  it('finds nothing for an estimate under the ceiling, at any length', () => {
    const fine = ride('fine', 0, 'virtual', {
      300: { watts: watts(over(300) * 0.95), heartRate: 150 },
      1200: { watts: watts(5), heartRate: 150 },
    })
    expect(estimatedPowerOver(fine, masses)).toBeUndefined()
  })

  it('leaves a ride with a meter to the meter’s own rule, and a run alone', () => {
    const metered = ride('metered', 0, 'measured', { 1200: { watts: watts(12), heartRate: 150 } })
    expect(estimatedPowerOver(metered, masses)).toBeUndefined()
    const asRun = {
      ...ride('run', 0, 'virtual', { 1200: { watts: watts(12), heartRate: 150 } }),
      sport: 'run' as const,
    }
    expect(estimatedPowerOver(asRun, masses)).toBeUndefined()
  })

  it('reads the mass again when it changes', () => {
    const borderline = ride('b', 0, 'virtual', { 1200: { watts: 480, heartRate: 150 } })
    // The terms here are pure air, so the watts are the same at any mass; the per-kilo figure is what moves.
    expect(estimatedPowerOver(borderline, fixedMasses(70, 9))).toBeUndefined() // 6.9 W/kg
    expect(estimatedPowerOver(borderline, fixedMasses(55, 9))?.wkg).toBeCloseTo(480 / 55, 6)
  })
})

describe('an estimate over the ceiling in the analysis', () => {
  const fast = ride('fast', 3, 'virtual', { 1200: { watts: watts(10), heartRate: 150 } })
  const normal = ride('normal', 2, 'virtual', { 1200: { watts: watts(4), heartRate: 150 } })

  it('is set aside, like a meter’s implausible power, and the athlete can keep it', () => {
    expect(powerCheckOf(fast, massesOf(SETTINGS))).toBe('set-aside')
    expect(powerCheckOf(normal, massesOf(SETTINGS))).toBeUndefined()
    expect(powerCheckOf(fast, massesOf({ ...SETTINGS, keepPower: ['fast'] }))).toBe('kept')
  })

  it('leaves the next ride to set the best, and takes it back once kept', () => {
    const best = (settings = SETTINGS) =>
      combine([fast, normal], settings).rideCurve.find((p) => p.durationS === 1200)?.activityId
    expect(best()).toBe('normal')
    expect(best({ ...SETTINGS, keepPower: ['fast'] })).toBe('fast')
  })

  it('is not judged while no weight is entered', () => {
    expect(powerCheckOf(fast, massesOf({ ...SETTINGS, massAssumed: true }))).toBeUndefined()
  })

  it('puts what the estimate needs on the flagged summary, and nothing on a measured ride’s', () => {
    const metered = ride('metered', 4, 'measured', { 1200: { watts: watts(12), heartRate: 150 } })
    const summaries = activitySummaries([fast, normal, metered], SETTINGS)
    const by = (id: string) => summaries.find((summary) => summary.id === id)!
    expect(by('fast')).toMatchObject({
      powerCheck: 'set-aside',
      estimatedPower: { durationS: 1200 },
    })
    expect(by('fast').estimatedPower?.wkg).toBeCloseTo(10, 6)
    expect(by('metered')).toMatchObject({ powerCheck: 'set-aside' })
    expect(by('metered')).not.toHaveProperty('estimatedPower')
    expect(by('normal')).not.toHaveProperty('powerCheck')
  })
})
