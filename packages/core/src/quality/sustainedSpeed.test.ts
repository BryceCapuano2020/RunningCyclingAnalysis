import { describe, expect, it } from 'vitest'
import { runCeilingSpeed } from '../curves'
import { implausibleSpeedStretches, sustainedSpeedCeiling } from './sustainedSpeed'
import type { Sport } from '../types'

const at = (n: number, speed: number, sport: Sport = 'run') => ({
  n,
  sport,
  speed: new Float64Array(n).fill(speed),
})

describe('sustainedSpeedCeiling', () => {
  it('is the world-record ceiling for a run and a generous table for a ride', () => {
    expect(sustainedSpeedCeiling('run', 755)).toBe(runCeilingSpeed(755))
    expect(sustainedSpeedCeiling('ride', 3600)).toBeCloseTo(19.4, 9)
    expect(sustainedSpeedCeiling('ride', 5)).toBe(30)
  })

  it('falls as the duration grows, for both sports', () => {
    for (const sport of ['run', 'ride'] as const) {
      let previous = Infinity
      for (const durationS of [5, 30, 120, 600, 1800, 7200]) {
        const ceiling = sustainedSpeedCeiling(sport, durationS)
        expect(ceiling).toBeLessThanOrEqual(previous)
        previous = ceiling
      }
    }
  })
})

describe('implausibleSpeedStretches', () => {
  it('flags three minutes of 9 m/s on a run, though no single second is a jump', () => {
    const a = at(600, 3)
    a.speed.fill(9, 200, 380)
    const stretches = implausibleSpeedStretches(a)
    expect(stretches.length).toBeGreaterThan(0)
    // Every second of the fast stretch is inside a flagged one.
    for (let i = 200; i < 380; i++) {
      expect(stretches.some((s) => s.start <= i && i < s.end)).toBe(true)
    }
    // Nothing is flagged far from it.
    expect(stretches[0]!.start).toBeGreaterThanOrEqual(0)
    expect(stretches.at(-1)!.end).toBeLessThanOrEqual(600)
  })

  it('leaves a fast but possible run alone: a 4:44 mile pace held for twenty minutes is not flagged', () => {
    // 5.66 m/s is a 4:44 mile. Held for 20 minutes it is a 19:40-ish 5 km and below the ceiling.
    expect(implausibleSpeedStretches(at(1200, 5.66))).toEqual([])
  })

  it('leaves a 5 km in 19:40 and a kilometre in 2:54 alone', () => {
    const fiveK = at(1180, 5000 / 1180)
    expect(implausibleSpeedStretches(fiveK)).toEqual([])
    const km = at(600, 3)
    km.speed.fill(1000 / 174, 100, 274)
    expect(implausibleSpeedStretches(km)).toEqual([])
  })

  it('flags a sustained speed no one runs even where the stretch is short of a minute', () => {
    const a = at(300, 3)
    a.speed.fill(11.5, 100, 130)
    expect(implausibleSpeedStretches(a).length).toBeGreaterThan(0)
  })

  it('applies a sport-specific ceiling: 25 m/s for 20 minutes is a vehicle on a ride, a ride only for a minute', () => {
    expect(implausibleSpeedStretches(at(1200, 25, 'ride')).length).toBeGreaterThan(0)
    expect(implausibleSpeedStretches(at(60, 25, 'ride'))).toEqual([])
  })

  it('does not check a window with an unknown second, so that second splits the stretch', () => {
    const a = at(400, 3)
    a.speed.fill(9.5, 100, 300)
    a.speed[200] = NaN
    const stretches = implausibleSpeedStretches(a)
    const covers = (i: number) => stretches.some((s) => s.start <= i && i < s.end)
    // Every window over second 200 has an unknown speed and is skipped, so nothing covers it. The
    // fast seconds either side are still caught by the windows that stop short of it or start after it.
    expect(covers(200)).toBe(false)
    expect(covers(150)).toBe(true)
    expect(covers(250)).toBe(true)
    expect(stretches.length).toBe(2)
    // The stretches are in order and apart.
    expect(stretches[0]!.end).toBeLessThanOrEqual(200)
    expect(stretches[1]!.start).toBeGreaterThan(200)
  })

  it('returns nothing for an empty activity', () => {
    expect(implausibleSpeedStretches(at(0, 0))).toEqual([])
  })
})
