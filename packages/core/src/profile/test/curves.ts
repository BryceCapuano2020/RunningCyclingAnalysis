import { durationProfile } from '../index'
import type { ProfilePoint } from '../index'

/** Morton's three-parameter model: the power held for t seconds. */
export function morton(t: number, cp: number, wPrime: number, pmax: number): number {
  return cp + wPrime / (t + wPrime / (pmax - cp))
}

export const DURATIONS = [
  5, 10, 15, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 2700, 3600,
]

/** A ride's curve from a known model, spread over four sessions so that none is the only source. */
export function modelCurve(change: (durationS: number, value: number) => number = (_, v) => v) {
  return DURATIONS.map((durationS, i): ProfilePoint => ({
    durationS,
    value: change(durationS, morton(durationS, 250, 20_000, 1000)),
    sessionId: `session-${i % 4}`,
  }))
}

/** The curve with one duration's value scaled. */
export function scaled(durationS: number, factor: number): ProfilePoint[] {
  return modelCurve((d, value) => (d === durationS ? value * factor : value))
}

export function ready(points: ProfilePoint[]) {
  const profile = durationProfile(points)
  if (profile.status !== 'ready') throw new Error(`not ready: ${JSON.stringify(profile)}`)
  return profile
}

export const standing = (points: ProfilePoint[]) =>
  ready(points)
    .rows.filter((row) => row.standsOut !== null)
    .map((row) => [row.durationS, row.standsOut])
