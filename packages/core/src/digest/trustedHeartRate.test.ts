import { describe, expect, it } from 'vitest'
import type { ActivityDigest, DigestCurvePoint } from '../types'
import { trustedHeartRate } from './trustedHeartRate'

/** A power-meter ride with one 10 min best at 300 W and the given heart rates. */
function ride(id: string, heartRate: number, maxHeartRate: number): ActivityDigest {
  const point: DigestCurvePoint = {
    durationS: 600,
    value: 300,
    startIndex: 0,
    windowS: 600,
    heartRate,
    terms: null,
  }
  return {
    id,
    sport: 'ride',
    hasHeartRate: true,
    indoor: false,
    powerSource: 'measured',
    flags: [],
    flagCounts: {},
    maxHeartRate,
    curve: [point],
  } as unknown as ActivityDigest
}

const fits = { run: null, ride: { cp: 250, wPrime: 0, cpSe: 0, r2: 1, nPoints: 4 } }
const watts = (_digest: ActivityDigest, point: DigestCurvePoint) => point.value

describe('trustedHeartRate', () => {
  it('settles on one answer where judging all at once would flip between two', () => {
    // Against A's own 190 spike, A's 130 is under the floor; against B's 170 alone, it is not.
    const a = ride('a', 130, 190)
    const b = ride('b', 160, 170)
    const heart = trustedHeartRate([a, b], fits, watts)
    expect([...heart.setAside]).toEqual(['a'])
    expect(heart.reference.ride).toBe(170)
    expect(heart.trusted.map((d) => d.id)).toEqual(['b'])
  })

  it('retakes the references before judging the next, so a spike does not set aside a sound ride', () => {
    const spike = ride('spike', 60, 250)
    const sound = ride('sound', 150, 175)
    expect([...trustedHeartRate([spike, sound], fits, watts).setAside]).toEqual(['spike'])
  })
})
