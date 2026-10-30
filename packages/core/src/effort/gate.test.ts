import { describe, expect, it } from 'vitest'
import { HEADLINE_DURATION_S } from '../constants'
import type { EffortPoint } from './effort'
import {
  HABITUAL_MIN_DAYS,
  HABITUAL_PEAK_RATIO,
  REFERENCE_FLOOR_BPM,
  effortGateOf,
  isHardShare,
  readReferences,
  sessionEffort,
} from './gate'

const point = (durationS: number, value: number, heartRate: number | null): EffortPoint => ({
  durationS,
  value,
  activityId: 'a',
  startIndex: 0,
  windowS: durationS,
  heartRate,
})

describe('isHardShare', () => {
  it('is judged on the percent shown: 89.5% reads 90% and is hard, 89.4% reads 89% and is not', () => {
    expect(isHardShare(0.895)).toBe(true)
    expect(isHardShare(0.8949)).toBe(false)
    expect(isHardShare(1.1)).toBe(true)
  })
})

describe('readReferences', () => {
  const days = (share: number, count = HABITUAL_MIN_DAYS) => ({ share, days: count })
  const both = { run: 190, ride: 184 }
  const own = { run: 190, ride: 184 }

  it('reads a reference under the floor as low, whatever the days say', () => {
    const low = { run: REFERENCE_FLOOR_BPM - 0.5, ride: null }
    const read = readReferences(low, low, { run: days(0.7), ride: null })
    expect(read).toEqual({ run: 'low', ride: null })
    expect(
      readReferences(
        { run: REFERENCE_FLOOR_BPM, ride: null },
        { run: REFERENCE_FLOOR_BPM, ride: null },
        { run: days(0.7), ride: null },
      ).run,
    ).toBe('trusted')
  })

  it('reads a reference whose typical day sits at the line, over twelve days, as habitual', () => {
    const at = readReferences(both, own, { run: days(HABITUAL_PEAK_RATIO), ride: days(0.8) })
    expect(at).toEqual({ run: 'habitual', ride: 'trusted' })
    const under = readReferences(both, own, {
      run: days(HABITUAL_PEAK_RATIO - 0.01),
      ride: days(0.8),
    })
    expect(under.run).toBe('trusted')
  })

  it('reads a thinner library as trusted: too few days to say where the athlete lives', () => {
    const thin = readReferences(both, own, {
      run: days(1, HABITUAL_MIN_DAYS - 1),
      ride: days(1, 1),
    })
    expect(thin).toEqual({ run: 'trusted', ride: 'trusted' })
  })

  it('takes a reference worked out from the other sport from that sport’s days', () => {
    // The ride reference is the run maximum less six: the ride's own days say nothing of it, the run's do.
    const worked = { run: 190, ride: 184 }
    const rideOwn = { run: 190, ride: 150 }
    expect(readReferences(worked, rideOwn, { run: days(0.8), ride: days(0.99) }).ride).toBe(
      'trusted',
    )
    expect(readReferences(worked, rideOwn, { run: days(0.95), ride: days(0.6) }).ride).toBe(
      'habitual',
    )
  })
})

describe('effortGateOf', () => {
  const curve = [point(300, 20, 175), point(HEADLINE_DURATION_S, 16, 171)]
  const fit = curve.map(({ durationS, value }) => ({ durationS, value }))

  it('is hard when the best 20 minutes reached the line of a reference that can be trusted', () => {
    const gate = effortGateOf(curve, fit, 190, 'trusted')
    expect(gate.verdict).toBe('hard')
    expect(gate.share).toBeCloseTo(171 / 190)
    expect(gate.floor).toBe(16)
    expect(gate.neededS).toBe(HEADLINE_DURATION_S)
  })

  it('is not hard under the line, and carries the demonstrated best as the floor', () => {
    const gate = effortGateOf(curve, fit, 200, 'trusted')
    expect(gate.verdict).toBe('notHard')
    expect(gate.floor).toBe(16)
  })

  it('is not hard when the reference cannot be trusted, however high the share', () => {
    for (const reading of ['low', 'habitual'] as const) {
      const gate = effortGateOf(curve, fit, 150, reading)
      expect(gate.share).toBeGreaterThan(1)
      expect(gate.verdict).toBe('notHard')
      expect(gate.reference).toBe(reading)
    }
  })

  it('cannot say without a heart rate on the best 20 minutes, a reference or a 20 minute best', () => {
    expect(effortGateOf([point(1200, 16, null)], fit, 190, 'trusted').verdict).toBe('unknown')
    expect(effortGateOf(curve, fit, null, null).verdict).toBe('unknown')
    expect(
      effortGateOf([point(300, 20, 175)], [{ durationS: 300, value: 20 }], 190, 'trusted'),
    ).toMatchObject({
      verdict: 'unknown',
      floor: null,
    })
  })
})

describe('sessionEffort', () => {
  it('judges a session by its peak against the reference', () => {
    expect(sessionEffort(180, 190, 'trusted')).toBe('hard')
    expect(sessionEffort(150, 190, 'trusted')).toBe('notHard')
    expect(sessionEffort(190, 190, 'habitual')).toBe('notHard')
    expect(sessionEffort(null, 190, 'trusted')).toBe('unknown')
    expect(sessionEffort(180, null, null)).toBe('unknown')
  })
})
