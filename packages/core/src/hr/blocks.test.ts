import { describe, expect, it } from 'vitest'
import { HR_BLOCK_S, HR_SKIP_S } from '../constants'
import { averageBlocks } from './blocks'

function streams(n: number, power: (i: number) => number, hr: (i: number) => number) {
  const column = new Float64Array(n)
  const heartRate = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    column[i] = power(i)
    heartRate[i] = hr(i)
  }
  return {
    columns: [column],
    heartRate,
    valid: new Uint8Array(n).fill(1),
    validHeartRate: new Uint8Array(n).fill(1),
  }
}

function run(s: ReturnType<typeof streams>, opts?: Parameters<typeof averageBlocks>[4]) {
  return averageBlocks(s.columns, s.heartRate, s.valid, s.validHeartRate, opts)
}

describe('averageBlocks', () => {
  it('averages each default 300 s block after skipping the first 600 s', () => {
    const s = streams(
      1200,
      (i) => (i < 600 ? 10 : i < 900 ? 3 : 4),
      (i) => (i < 600 ? 200 : i < 900 ? 120 : 150),
    )
    expect(run(s)).toEqual([
      { heartRate: 120, means: [3] },
      { heartRate: 150, means: [4] },
    ])
  })

  it('takes its default block length and skip from the shared constants', () => {
    const s = streams(
      1200,
      (i) => (i < 600 ? 10 : i < 900 ? 3 : 4),
      (i) => (i < 600 ? 200 : i < 900 ? 120 : 150),
    )
    expect(HR_BLOCK_S).toBe(300)
    expect(HR_SKIP_S).toBe(600)
    expect(run(s)).toEqual(run(s, { blockS: HR_BLOCK_S, skipS: HR_SKIP_S }))
  })

  it('takes the mean of alternating samples inside a block', () => {
    const s = streams(
      900,
      (i) => (i % 2 === 0 ? 3 : 5),
      (i) => 100 + (i % 3),
    )
    expect(run(s)).toEqual([{ heartRate: 101, means: [4] }])
  })

  it('drops a trailing partial block', () => {
    expect(
      run(
        streams(
          1199,
          () => 3,
          () => 120,
        ),
      ),
    ).toHaveLength(1)
  })

  it('returns nothing when the stream ends before a full block after the skip', () => {
    expect(
      run(
        streams(
          600,
          () => 3,
          () => 120,
        ),
      ),
    ).toEqual([])
  })

  it('honours custom block and skip lengths', () => {
    const s = streams(
      25,
      (i) => i,
      () => 60,
    )
    expect(run(s, { blockS: 10, skipS: 5 })).toEqual([
      { heartRate: 60, means: [9.5] },
      { heartRate: 60, means: [19.5] },
    ])
  })

  it('keeps a block with exactly 90% usable samples and averages only those', () => {
    const s = streams(
      900,
      (i) => (i >= 600 && i < 630 ? 1000 : 3),
      () => 120,
    )
    for (let i = 600; i < 630; i++) s.valid[i] = 0
    expect(run(s)).toEqual([{ heartRate: 120, means: [3] }])
  })

  it('drops a block with fewer than 90% usable samples', () => {
    const s = streams(
      900,
      () => 3,
      () => 120,
    )
    for (let i = 600; i < 631; i++) s.valid[i] = 0
    expect(run(s)).toEqual([])
  })

  it('counts NaN columns, NaN heart rate and the validHeartRate flag as unusable', () => {
    const s = streams(
      900,
      () => 3,
      () => 120,
    )
    for (let i = 600; i < 605; i++) s.columns[0]![i] = Number.NaN
    for (let i = 605; i < 610; i++) s.heartRate[i] = Number.NaN
    for (let i = 610; i < 630; i++) s.validHeartRate[i] = 0
    expect(run(s)).toEqual([{ heartRate: 120, means: [3] }])

    s.validHeartRate[630] = 0
    expect(run(s)).toEqual([])
  })

  it('excludes a sample from every column when any column is NaN there', () => {
    const s = streams(
      900,
      () => 2,
      () => 130,
    )
    s.columns[0]![700] = 1000
    const second = new Float64Array(900).fill(8)
    second[700] = Number.NaN
    s.columns.push(second)
    // The 1000 W spike would pull the first mean up if sample 700 were not excluded.
    expect(run(s)).toEqual([{ heartRate: 130, means: [2, 8] }])
  })

  it('drops one block without changing the others', () => {
    const s = streams(
      1500,
      (i) => (i < 900 ? 3 : i < 1200 ? 5 : 7),
      () => 120,
    )
    // 31 invalid samples leave 269 of the first block's 300, one short of 90%.
    for (let i = 600; i < 631; i++) s.valid[i] = 0
    expect(run(s)).toEqual([
      { heartRate: 120, means: [5] },
      { heartRate: 120, means: [7] },
    ])
  })

  it('returns nothing for a non-positive block length or all-invalid data', () => {
    const s = streams(
      900,
      () => 3,
      () => 120,
    )
    expect(run(s, { blockS: 0 })).toEqual([])
    s.valid.fill(0)
    expect(run(s)).toEqual([])
  })

  it('averages heart rate alone when there are no columns', () => {
    const s = streams(
      900,
      () => 3,
      () => 120,
    )
    expect(averageBlocks([], s.heartRate, s.valid, s.validHeartRate)).toEqual([
      { heartRate: 120, means: [] },
    ])
  })
})
