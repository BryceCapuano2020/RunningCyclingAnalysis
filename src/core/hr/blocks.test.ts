import { describe, expect, it } from 'vitest'
import { RESTING_W_PER_KG } from '../constants'
import { blockPoints } from './blocks'

function streams(n: number, power: (i: number) => number, hr: (i: number) => number) {
  const metabolicPower = new Float64Array(n)
  const heartRate = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    metabolicPower[i] = power(i)
    heartRate[i] = hr(i)
  }
  return {
    metabolicPower,
    heartRate,
    valid: new Uint8Array(n).fill(1),
    validHeartRate: new Uint8Array(n).fill(1),
  }
}

describe('blockPoints', () => {
  it('averages each default 300 s block after skipping the first 600 s', () => {
    const s = streams(
      1200,
      (i) => (i < 600 ? 10 : i < 900 ? 3 : 4),
      (i) => (i < 600 ? 200 : i < 900 ? 120 : 150),
    )
    const points = blockPoints(s.metabolicPower, s.heartRate, s.valid, s.validHeartRate, 'a')
    expect(points).toEqual([
      { metabolicPower: 3, heartRate: 120, activityId: 'a' },
      { metabolicPower: 4, heartRate: 150, activityId: 'a' },
    ])
  })

  it('takes the mean of alternating samples inside a block', () => {
    const s = streams(
      900,
      (i) => (i % 2 === 0 ? 3 : 5),
      (i) => 100 + (i % 3),
    )
    const points = blockPoints(s.metabolicPower, s.heartRate, s.valid, s.validHeartRate, 'a')
    expect(points).toEqual([{ metabolicPower: 4, heartRate: 101, activityId: 'a' }])
  })

  it('drops a trailing partial block', () => {
    const s = streams(
      1199,
      () => 3,
      () => 120,
    )
    const points = blockPoints(s.metabolicPower, s.heartRate, s.valid, s.validHeartRate, 'a')
    expect(points).toHaveLength(1)
  })

  it('returns nothing when the stream ends before a full block after the skip', () => {
    const s = streams(
      600,
      () => 3,
      () => 120,
    )
    expect(blockPoints(s.metabolicPower, s.heartRate, s.valid, s.validHeartRate, 'a')).toEqual([])
  })

  it('honours custom block and skip lengths', () => {
    const s = streams(
      25,
      (i) => i,
      () => 60,
    )
    const points = blockPoints(s.metabolicPower, s.heartRate, s.valid, s.validHeartRate, 'b', {
      blockS: 10,
      skipS: 5,
    })
    expect(points).toEqual([
      { metabolicPower: 9.5, heartRate: 60, activityId: 'b' },
      { metabolicPower: 19.5, heartRate: 60, activityId: 'b' },
    ])
  })

  it('keeps a block with exactly 90% usable samples and averages only those', () => {
    const s = streams(
      900,
      (i) => (i >= 600 && i < 630 ? 1000 : 3),
      () => 120,
    )
    for (let i = 600; i < 630; i++) s.valid[i] = 0
    const points = blockPoints(s.metabolicPower, s.heartRate, s.valid, s.validHeartRate, 'a')
    expect(points).toEqual([{ metabolicPower: 3, heartRate: 120, activityId: 'a' }])
  })

  it('drops a block with fewer than 90% usable samples', () => {
    const s = streams(
      900,
      () => 3,
      () => 120,
    )
    for (let i = 600; i < 631; i++) s.valid[i] = 0
    expect(blockPoints(s.metabolicPower, s.heartRate, s.valid, s.validHeartRate, 'a')).toEqual([])
  })

  it('counts NaN power, NaN heart rate and the validHeartRate flag as unusable', () => {
    const s = streams(
      900,
      () => 3,
      () => 120,
    )
    for (let i = 600; i < 605; i++) s.metabolicPower[i] = Number.NaN
    for (let i = 605; i < 610; i++) s.heartRate[i] = Number.NaN
    for (let i = 610; i < 630; i++) s.validHeartRate[i] = 0
    const kept = blockPoints(s.metabolicPower, s.heartRate, s.valid, s.validHeartRate, 'a')
    expect(kept).toEqual([{ metabolicPower: 3, heartRate: 120, activityId: 'a' }])

    s.validHeartRate[630] = 0
    expect(blockPoints(s.metabolicPower, s.heartRate, s.valid, s.validHeartRate, 'a')).toEqual([])
  })

  it('drops blocks whose mean power is below twice resting', () => {
    const s = streams(
      1200,
      (i) => (i < 900 ? 2 * RESTING_W_PER_KG - 0.01 : 2 * RESTING_W_PER_KG + 0.01),
      () => 120,
    )
    const points = blockPoints(s.metabolicPower, s.heartRate, s.valid, s.validHeartRate, 'a')
    expect(points).toHaveLength(1)
    expect(points[0]!.metabolicPower).toBeCloseTo(2 * RESTING_W_PER_KG + 0.01, 10)
    expect(points[0]!.heartRate).toBe(120)
  })

  it('returns nothing for a non-positive block length or all-invalid data', () => {
    const s = streams(
      900,
      () => 3,
      () => 120,
    )
    expect(
      blockPoints(s.metabolicPower, s.heartRate, s.valid, s.validHeartRate, 'a', { blockS: 0 }),
    ).toEqual([])
    s.valid.fill(0)
    expect(blockPoints(s.metabolicPower, s.heartRate, s.valid, s.validHeartRate, 'a')).toEqual([])
  })
})
