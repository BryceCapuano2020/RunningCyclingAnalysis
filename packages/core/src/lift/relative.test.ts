import { describe, expect, it } from 'vitest'
import '../test/deviceZone'
import type { AthleteSettings, Measurement } from '../athlete'
import { civilOfDay } from '../calendar'
import { dayOfLiftDate } from './estimate'
import type { LiftEstimate } from './estimate'
import { massSdFor, relativeStrength } from './relative'

const DATE = '2026-03-10'
const est: LiftEstimate = {
  date: DATE,
  point: 150,
  low: 130,
  high: 175,
  floor: { loadKg: 100, reps: 3, date: DATE },
  sessions: 3,
  sd: 0.08,
}

/** The date this many days before DATE. */
function before(days: number): string {
  const c = civilOfDay(dayOfLiftDate(DATE) - days)
  return `${c.year}-${String(c.month + 1).padStart(2, '0')}-${String(c.date).padStart(2, '0')}`
}
const mass = (value: number, from: string): Measurement => ({ kind: 'massKg', value, from })
const settings = (...measurements: Measurement[]): AthleteSettings => ({
  massKg: 70,
  bikeMassKg: 9,
  measurements,
})

describe('relativeStrength', () => {
  it('divides by the mass in effect, with both exponents and ranges (hand figures)', () => {
    const r = relativeStrength(est, settings(mass(75, DATE)))!
    expect(r.massKg).toBe(75)
    expect(r.massSd).toBeCloseTo(0.01, 12)
    // 150 / 75 = 2; sd = hypot(0.08, 0.01) = 0.080623
    expect(r.ratio.point).toBeCloseTo(2, 9)
    expect(r.ratio.low).toBeCloseTo(1.8303, 3)
    expect(r.ratio.high).toBeCloseTo(2.2571, 3)
    // 75^0.67 = 18.0423; 150 / that; sd = hypot(0.08, 0.0067)
    const m67 = Math.pow(75, 0.67)
    expect(m67).toBeCloseTo(18.04, 1)
    expect(r.allometric.point).toBeCloseTo(8.3138, 3)
    expect(r.allometric.low).toBeCloseTo(7.6111, 3)
    expect(r.allometric.high).toBeCloseTo(9.3777, 3)
  })

  it('uses the entry in effect on the estimate date, not a later one', () => {
    const r = relativeStrength(est, settings(mass(80, '2026-01-01'), mass(60, '2026-03-11')))!
    expect(r.massKg).toBe(80)
    expect(r.massAgeDays).toBe(68)
  })

  it('grows the mass error 0.005 per 30 days and stops at 0.04', () => {
    expect(massSdFor(0)).toBeCloseTo(0.01, 12)
    expect(massSdFor(30)).toBeCloseTo(0.015, 12)
    expect(massSdFor(90)).toBeCloseTo(0.025, 12)
    expect(massSdFor(180)).toBeCloseTo(0.04, 12)
    expect(massSdFor(300)).toBeCloseTo(0.04, 12)
    for (const [days, sd] of [
      [30, 0.015],
      [90, 0.025],
      [365, 0.04],
    ] as const) {
      const r = relativeStrength(est, settings(mass(75, before(days))))!
      expect(r.massAgeDays).toBe(days)
      expect(r.massSd).toBeCloseTo(sd, 12)
      expect(r.ratio.low).toBeCloseTo(2 * Math.exp(-1.1 * Math.hypot(0.08, sd)), 9)
    }
  })

  it('is absent when the entry is more than 365 days before the estimate', () => {
    expect(relativeStrength(est, settings(mass(75, before(365))))).not.toBeNull()
    expect(relativeStrength(est, settings(mass(75, before(366))))).toBeNull()
  })

  it('takes a dateless profile mass at the largest error, and not a placeholder', () => {
    const r = relativeStrength(est, settings())!
    expect(r.massKg).toBe(70)
    expect(r.massAgeDays).toBeNull()
    expect(r.massSd).toBe(0.04)
    expect(relativeStrength(est, { ...settings(), massAssumed: true })).toBeNull()
  })

  it('keeps the floor under the low end and widens a deadlift high end by 5%', () => {
    const tight = { ...est, point: 141, sd: 0.2, floor: { ...est.floor, loadKg: 140 } }
    expect(relativeStrength(tight, settings(mass(70, DATE)))!.ratio.low).toBeCloseTo(2, 9)
    const plain = relativeStrength(est, settings(mass(75, DATE)))!
    const dead = relativeStrength(est, settings(mass(75, DATE)), true)!
    expect(dead.ratio.high).toBeCloseTo(plain.ratio.high * 1.05, 9)
  })
})
