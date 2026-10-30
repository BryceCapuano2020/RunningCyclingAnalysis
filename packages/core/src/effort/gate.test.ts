import { describe, expect, it } from 'vitest'
import { HEADLINE_DURATION_S } from '../constants'
import { effortGateOf, isHardShare, judgedTwentyMinutes } from './gate'
import type { GateReference } from './gate'

describe('isHardShare', () => {
  it('is judged on the percent shown: 89.5% reads 90% and is hard, 89.4% reads 89% and is not', () => {
    expect(isHardShare(0.895)).toBe(true)
    expect(isHardShare(0.8949)).toBe(false)
    expect(isHardShare(1.1)).toBe(true)
  })
})

describe('judgedTwentyMinutes', () => {
  it('judges the best, or the effort with the highest heart rate among those within 5% of it', () => {
    const points = [
      { value: 10, heartRate: 150 },
      { value: 9.6, heartRate: 172 },
      { value: 9, heartRate: 190 },
    ]
    // 9.6 is within 5% of 10; 9 is not. Of the two the higher heart rate is judged.
    expect(judgedTwentyMinutes(points)).toEqual({ best: 10, heartRate: 172 })
  })

  it('has no heart rate where the efforts near the best have none, and no best without a value', () => {
    expect(
      judgedTwentyMinutes([
        { value: 10, heartRate: null },
        { value: 8, heartRate: 180 },
      ]),
    ).toEqual({
      best: 10,
      heartRate: null,
    })
    expect(judgedTwentyMinutes([])).toEqual({ best: null, heartRate: null })
    expect(judgedTwentyMinutes([{ value: Number.NaN, heartRate: 150 }]).best).toBeNull()
  })
})

describe('effortGateOf', () => {
  const points = [{ value: 16, heartRate: 171 }]
  const floor = { durationS: 1800, value: 15 }
  const none = { hard: [], endurance: [] }
  const ref = (over: Partial<GateReference> = {}): GateReference => ({
    bpm: 190,
    reading: 'trusted',
    source: 'data',
    from: 'run',
    ...over,
  })

  it('is hard when the best 20 minutes reached the line of a reference that can be trusted', () => {
    const gate = effortGateOf(points, floor, ref(), none)
    expect(gate.verdict).toBe('hard')
    expect(gate.share).toBeCloseTo(171 / 190)
    expect(gate.floor).toEqual(floor)
    expect(gate.neededS).toBe(HEADLINE_DURATION_S)
    expect(gate.unchecked).toBeNull()
  })

  it('is not hard under the line, and asks for a hard 20 minutes', () => {
    const gate = effortGateOf(points, floor, ref({ bpm: 200 }), none)
    expect(gate.verdict).toBe('notHard')
    expect(gate.neededS).toBe(HEADLINE_DURATION_S)
  })

  it('is not hard when the reference cannot be trusted, however high the share, and then asks for no effort', () => {
    for (const reading of ['low', 'habitual', 'high'] as const) {
      const gate = effortGateOf(points, floor, ref({ bpm: 150, reading }), none)
      expect(gate.share).toBeGreaterThan(1)
      expect(gate.verdict).toBe('notHard')
      expect(gate.reference).toBe(reading)
      expect(gate.neededS).toBeNull()
    }
  })

  it('cannot judge a reference of too few days: it says so, and withholds nothing', () => {
    const gate = effortGateOf(points, floor, ref({ reading: 'thin' }), none)
    expect(gate.verdict).toBe('unknown')
    expect(gate.unchecked).toBe('thin')
  })

  it('cannot judge without a heart rate on the best, without a reference, or without a 20 minute best', () => {
    const bare = effortGateOf([{ value: 16, heartRate: null }], floor, ref(), none)
    expect([bare.verdict, bare.unchecked]).toEqual(['unknown', 'noHeartRate'])
    const open = effortGateOf(points, floor, ref({ bpm: null, reading: null }), none)
    expect([open.verdict, open.unchecked]).toEqual(['unknown', 'noHeartRate'])
    const missing = effortGateOf([], null, ref(), none)
    expect([missing.verdict, missing.unchecked, missing.floor]).toEqual(['unknown', 'noBest', null])
  })

  it('carries the sessions only where it judged', () => {
    const sessions = { hard: ['a'], endurance: ['b'] }
    expect(effortGateOf(points, floor, ref(), sessions).sessions).toEqual(sessions)
    expect(effortGateOf(points, floor, ref({ reading: 'thin' }), sessions).sessions).toEqual(none)
  })
})
