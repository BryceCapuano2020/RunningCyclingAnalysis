import { describe, expect, it } from 'vitest'
import { climbMask, findSegments, splitSegment } from './climbs'

function maskWithRuns(n: number, runs: [number, number][]): Uint8Array {
  const m = new Uint8Array(n)
  for (const [start, end] of runs) m.fill(1, start, end)
  return m
}

describe('climbMask', () => {
  it('flags every sample of a steady 5% climb at running speed', () => {
    const n = 50
    const mask = climbMask(new Float64Array(n).fill(0.05), new Float64Array(n).fill(5))
    expect(mask.length).toBe(n)
    expect(mask.every((x) => x === 1)).toBe(true)
  })

  it('flags nothing below the minimum grade', () => {
    const n = 50
    const mask = climbMask(new Float64Array(n).fill(0.02), new Float64Array(n).fill(5))
    expect(mask.every((x) => x === 0)).toBe(true)
  })

  it('respects a custom minimum grade', () => {
    const n = 50
    const grade = new Float64Array(n).fill(0.02)
    const speed = new Float64Array(n).fill(5)
    expect(climbMask(grade, speed, 0.01).every((x) => x === 1)).toBe(true)
  })

  it('requires speed strictly above 1 m/s and rejects NaN speed', () => {
    const n = 40
    const grade = new Float64Array(n).fill(0.05)
    const speed = new Float64Array(n).fill(5)
    speed[0] = 1
    speed[1] = NaN
    speed[2] = 1.01
    const mask = climbMask(grade, speed)
    expect(mask[0]).toBe(0)
    expect(mask[1]).toBe(0)
    expect(mask[2]).toBe(1)
    expect(mask[3]).toBe(1)
  })

  it('uses the 30-sample centred mean, so a grade step at 100 is flagged from 103', () => {
    // Window at i covers i-15..i+15 (31 samples). Mean >= 0.03 needs at least 19 of
    // the 31 samples at 5%, which first happens at i = 103 (19 * 0.05 / 31 = 0.0306).
    const n = 200
    const grade = new Float64Array(n)
    grade.fill(0.05, 100)
    const speed = new Float64Array(n).fill(5)
    const mask = climbMask(grade, speed)
    expect(mask[102]).toBe(0)
    expect(mask[103]).toBe(1)
    expect(mask[0]).toBe(0)
    expect(mask[199]).toBe(1)
  })

  it('returns an empty mask for empty input', () => {
    expect(climbMask(new Float64Array(0), new Float64Array(0)).length).toBe(0)
  })
})

describe('findSegments', () => {
  it('returns nothing for an empty or all-zero mask', () => {
    expect(findSegments(new Uint8Array(0))).toEqual([])
    expect(findSegments(new Uint8Array(500))).toEqual([])
  })

  it('keeps a run exactly at the minimum length and drops one sample shorter', () => {
    expect(findSegments(maskWithRuns(300, [[10, 130]]))).toEqual([{ start: 10, end: 130 }])
    expect(findSegments(maskWithRuns(300, [[10, 129]]))).toEqual([])
  })

  it('uses 120 s as the default minimum length', () => {
    const mask = maskWithRuns(400, [
      [0, 119],
      [200, 320],
    ])
    expect(findSegments(mask)).toEqual([{ start: 200, end: 320 }])
  })

  it('honours a custom minimum length', () => {
    const mask = maskWithRuns(400, [
      [0, 60],
      [200, 320],
    ])
    expect(findSegments(mask, 60)).toEqual([
      { start: 0, end: 60 },
      { start: 200, end: 320 },
    ])
  })

  it('closes a run that reaches the end of the mask with end = length', () => {
    const mask = maskWithRuns(300, [[100, 300]])
    expect(findSegments(mask)).toEqual([{ start: 100, end: 300 }])
  })

  it('splits adjacent runs separated by a single zero', () => {
    const mask = maskWithRuns(300, [
      [0, 150],
      [151, 300],
    ])
    expect(findSegments(mask)).toEqual([
      { start: 0, end: 150 },
      { start: 151, end: 300 },
    ])
  })
})

describe('splitSegment', () => {
  it('returns a segment shorter than one section whole', () => {
    expect(splitSegment({ start: 0, end: 119 })).toEqual([{ start: 0, end: 119 }])
  })

  it('returns one section for exactly 300 s', () => {
    expect(splitSegment({ start: 0, end: 300 })).toEqual([{ start: 0, end: 300 }])
  })

  it('merges a 119 s remainder into the first section', () => {
    expect(splitSegment({ start: 0, end: 419 })).toEqual([{ start: 0, end: 419 }])
  })

  it('keeps a 120 s remainder as its own section', () => {
    expect(splitSegment({ start: 0, end: 420 })).toEqual([
      { start: 0, end: 300 },
      { start: 300, end: 420 },
    ])
  })

  it('splits exact multiples into equal sections', () => {
    expect(splitSegment({ start: 0, end: 900 })).toEqual([
      { start: 0, end: 300 },
      { start: 300, end: 600 },
      { start: 600, end: 900 },
    ])
  })

  it('merges a short remainder into the last full section', () => {
    expect(splitSegment({ start: 0, end: 1000 })).toEqual([
      { start: 0, end: 300 },
      { start: 300, end: 600 },
      { start: 600, end: 1000 },
    ])
  })

  it('is offset by the segment start', () => {
    expect(splitSegment({ start: 1000, end: 1420 })).toEqual([
      { start: 1000, end: 1300 },
      { start: 1300, end: 1420 },
    ])
  })

  it('accepts custom section and minimum lengths', () => {
    // 250 s with 100 s sections: 100, 100, remainder 50 < 60 merges into the second.
    expect(splitSegment({ start: 0, end: 250 }, 100, 60)).toEqual([
      { start: 0, end: 100 },
      { start: 100, end: 250 },
    ])
  })
})
