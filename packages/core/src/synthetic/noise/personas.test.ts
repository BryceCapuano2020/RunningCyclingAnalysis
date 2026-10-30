import { describe, expect, it } from 'vitest'
import { digestActivity } from '../../digest/digestActivity'
import { PERSONAS, PERSONA_NAMES, persona } from './personas'
import { TUNING_CONFIGS } from './tuningConfigs'
import { unitSpread } from './unitSpread'

const WEEKS = 10
const entriesOf = (name: (typeof PERSONA_NAMES)[number], seed = 1, weeks = WEEKS) =>
  persona(name, seed, weeks).entries
const share = (xs: boolean[]) => xs.filter(Boolean).length / xs.length

describe('personas', () => {
  it('every persona makes a library of the sports it does', () => {
    for (const name of PERSONA_NAMES) {
      const entries = entriesOf(name)
      const sports = new Set(entries.map((e) => e.activity.sport))
      expect([...sports].sort()).toEqual(Object.keys(PERSONAS[name].plans).sort())
      expect(entries.length).toBeGreaterThan(10)
      for (const e of entries) expect(e.activity.n).toBeGreaterThan(600)
    }
  })

  it('is deterministic in the seed and differs between seeds', () => {
    const key = (seed: number) =>
      entriesOf('twoSport', seed, 8).map(
        (e) =>
          `${e.activity.id}:${e.activity.startMs}:${e.activity.n}:${e.activity.heartRate[300]}`,
      )
    expect(key(3)).toEqual(key(3))
    expect(key(3)).not.toEqual(key(4))
  })

  it('treadmill share follows the persona', () => {
    const indoor = (name: (typeof PERSONA_NAMES)[number]) =>
      share(entriesOf(name, 2, 16).map((e) => e.activity.indoor))
    expect(indoor('watchRunner')).toBe(0)
    expect(indoor('treadmillOnly')).toBe(1)
    expect(indoor('treadmillHeavy')).toBeGreaterThan(0.5)
    expect(indoor('treadmillHeavy')).toBeLessThan(0.9)
    const belt = entriesOf('treadmillOnly').map((e) => e.activity)
    expect(belt.every((a) => !a.hasAltitude && a.altitude[100] === 0)).toBe(true)
  })

  it('the phone runner has GPX files and no cadence; the watch runner has FIT and cadence', () => {
    const phone = entriesOf('phoneSlowRunner')
    expect(phone.every((e) => e.format === 'gpx' && e.activity.cadence === undefined)).toBe(true)
    const watch = entriesOf('watchRunner')
    expect(watch.every((e) => e.format === 'fit' && e.activity.cadence !== undefined)).toBe(true)
  })

  it('power follows the rider', () => {
    expect(entriesOf('ridePower').every((e) => e.activity.hasPower)).toBe(true)
    expect(entriesOf('rideNoPower').every((e) => !e.activity.hasPower)).toBe(true)
  })

  it('the slow runner is slow', () => {
    const median = (name: (typeof PERSONA_NAMES)[number]) => {
      const speeds = entriesOf(name, 1, 8)
        .filter((e) => e.effort === 'easy')
        .map((e) => e.activity.distance[e.activity.n - 1]! / e.activity.n)
        .sort((a, b) => a - b)
      return speeds[Math.floor(speeds.length / 2)]!
    }
    expect(median('phoneSlowRunner')).toBeLessThan(0.8 * median('watchRunner'))
  })

  it('a race is its distance, not a fixed time', () => {
    const races = (['watchRunner', 'phoneSlowRunner'] as const).flatMap((name) =>
      entriesOf(name, 1, 30).filter((e) => e.effort === 'race'),
    )
    expect(races.length).toBeGreaterThanOrEqual(2)
    for (const { activity: a } of races) {
      expect(Math.abs(a.distance[a.n - 1]! - 5000) / 5000).toBeLessThan(0.01)
      expect(a.distance[0]).toBe(0)
    }
    const times = races.map((r) => r.activity.n)
    expect(Math.max(...times)).toBeGreaterThan(1.15 * Math.min(...times))
  })

  it('has weeks off and a weekly level it can name', () => {
    const lib = persona('watchRunner', 1, 60)
    const weeks = new Set(lib.entries.map((e) => e.week))
    expect(60 - weeks.size).toBeGreaterThanOrEqual(2)
    for (const e of lib.entries) expect(e.weeklyLevel).toBe(lib.levels[e.week])
  })

  it('digests: easy outdoor runs reach the same-heart-rate unit with a plausible spread', () => {
    const spread = unitSpread(persona('watchRunner', 1, 26))
    expect(spread).not.toBeNull()
    expect(spread!.sd).toBeGreaterThan(0.02)
    expect(spread!.sd).toBeLessThan(0.07)
  })

  it('a treadmill-only library has no run the unit can use', () => {
    const digests = entriesOf('treadmillOnly', 1, 8).map((e) => digestActivity(e.activity))
    expect(digests.every((d) => d.indoor)).toBe(true)
    expect(unitSpread(persona('treadmillOnly', 1, 8))).toBeNull()
  })

  it('the tuning configurations differ from every persona and from each other', () => {
    const fingerprint = (s: (typeof PERSONAS)[keyof typeof PERSONAS]) => JSON.stringify(s)
    const personas = new Set(Object.values(PERSONAS).map(fingerprint))
    const tuning = Object.values(TUNING_CONFIGS).map(fingerprint)
    expect(new Set(tuning).size).toBe(tuning.length)
    for (const t of tuning) expect(personas.has(t)).toBe(false)
  })
})
