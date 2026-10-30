import { describe, expect, it } from 'vitest'
import type { ActivityDigest, DigestCurvePoint } from '../types'
import { trustedHeartRate } from './trustedHeartRate'

const DAY_MS = 86_400_000

/** A power-meter ride, on its own day, with one 10 min best at 300 W and the given heart rates. */
function ride(id: string, heartRate: number, maxHeartRate: number, day = 0): ActivityDigest {
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
    startMs: Date.UTC(2025, 0, 1) + day * DAY_MS,
    hasHeartRate: true,
    indoor: false,
    powerSource: 'measured',
    flags: [],
    flagCounts: {},
    maxHeartRate,
    curve: [point],
    hrBlocks: [],
  } as unknown as ActivityDigest
}

const fits = { run: null, ride: { cp: 250, wPrime: 0, cpSe: 0, r2: 1, nPoints: 4 } }
const watts = (_digest: ActivityDigest, point: DigestCurvePoint) => point.value

describe('trustedHeartRate', () => {
  it('settles on one answer where judging all at once would flip between two', () => {
    // Three rides of a sensor that read 130 against a peak of about 190, and three of one that read 160 against a
    // peak of about 170. Against the first group's own 190 the 130 is under the floor; against the second's 170 alone it
    // is not, so the first group's reading must not hold up its own floor.
    const a = [ride('a1', 130, 190.3, 0), ride('a2', 130, 189.7, 1), ride('a3', 130, 190.1, 2)]
    const b = [ride('b1', 160, 170.4, 3), ride('b2', 160, 169.6, 4), ride('b3', 160, 170.2, 5)]
    const heart = trustedHeartRate([...a, ...b], fits, watts)
    // The first group is set aside while two of its days still agree on 190; the third, once it stands alone, is
    // judged against the 170 that is left and is kept.
    expect([...heart.setAside].sort()).toEqual(['a1', 'a2'])
    expect(heart.reference.ride).toBeCloseTo(170.4, 9)
    expect(heart.trusted.map((d) => d.id)).toEqual(['a3', 'b1', 'b2', 'b3'])
  })

  it('retakes the references before judging the next, so spikes do not set aside a sound ride', () => {
    // Three spiking days agree at about 250, and every sound ride is under the floor of that.
    const spikes = [ride('s1', 60, 250.2, 0), ride('s2', 60, 249.8, 1), ride('s3', 60, 250.6, 2)]
    const sound = [ride('ok1', 150, 175.1, 3), ride('ok2', 150, 174.3, 4)]
    const heart = trustedHeartRate([...spikes, ...sound], fits, watts)
    expect([...heart.setAside].sort()).toEqual(['s1', 's2', 's3'])
    expect(heart.trusted.map((d) => d.id)).toEqual(['ok1', 'ok2'])
  })

  it('does not raise the reference for one spike, so a sound ride is not judged against it', () => {
    const sound = Array.from({ length: 12 }, (_, i) => ride(`ok${i}`, 150, 175 + (i % 3) * 0.3, i))
    const heart = trustedHeartRate([ride('spike', 150, 250.2, 20), ...sound], fits, watts)
    expect(heart.setAside.size).toBe(0)
    expect(heart.reference.ride).toBeLessThan(180)
  })

  it('sets aside, before any best effort is judged, an activity whose heart rate reads low for its power throughout', () => {
    const withBlocks = (id: string, watts: number, share: number): ActivityDigest => {
      const base = ride(id, 150, 175)
      const hrBlocks = Array.from({ length: 6 }, () => ({
        heartRate: (60 + 0.35 * watts) * share,
        value: watts,
        terms: null,
      }))
      return Object.assign({}, base, { movingS: 5400, hrBlocks })
    }
    const sound = Array.from({ length: 14 }, (_, i) => withBlocks(`s${i}`, 140 + i * 10, 1))
    const heart = trustedHeartRate([...sound, withBlocks('locked', 210, 0.6)], fits, watts)
    expect([...heart.setAside]).toEqual(['locked'])
    expect(heart.trusted).toHaveLength(14)
  })
})
