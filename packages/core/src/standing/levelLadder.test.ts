import { describe, expect, it } from 'vitest'
import type { SportGrade } from '../grade'
import { GRADE_LEVELS } from '../grade'
import { levelLadder } from './levelLadder'
import { NO_TRIANGLE_GRADES, triangleGeometry } from './triangle'
import type { TriangleGrade, TriangleGrades } from './triangle'

const graded = (centre: number, low?: number, high?: number): TriangleGrade => {
  const sport: SportGrade = {
    centre: { grade: centre, level: 'x' },
    range:
      low === undefined || high === undefined
        ? null
        : { low: { grade: low, level: 'x' }, high: { grade: high, level: 'x' } },
  }
  return { kind: 'graded', grade: sport }
}

describe('levelLadder', () => {
  it('lists every level highest first, each band running to one under the next floor', () => {
    const ladder = levelLadder(NO_TRIANGLE_GRADES)
    expect(ladder.map((rung) => rung.label)).toEqual(GRADE_LEVELS.map((band) => band.label))
    expect(ladder.map((rung) => [rung.low, rung.high])).toEqual([
      [90, null],
      [80, 89],
      [70, 79],
      [60, 69],
      [50, 59],
      [40, 49],
      [30, 39],
      [0, 29],
    ])
    expect(ladder.every((rung) => rung.sports.length === 0)).toBe(true)
  })

  it('puts each graded sport in the band its triangle corner names, with the same percent', () => {
    const grades: TriangleGrades = {
      run: graded(0.5999, 0.55, 0.65),
      ride: graded(0.52),
      lift: graded(0.71),
    }
    const ladder = levelLadder(grades)
    const club = ladder.find((rung) => rung.label === 'Club')
    expect(club?.sports).toEqual([
      { sport: 'run', percent: 59 },
      { sport: 'ride', percent: 52 },
    ])
    expect(ladder.find((rung) => rung.label === 'Regional')?.sports).toEqual([
      { sport: 'lift', percent: 71 },
    ])
    const { corners } = triangleGeometry(grades, 300)
    for (const rung of ladder) {
      for (const { sport, percent } of rung.sports) {
        expect([percent, rung.label]).toEqual([corners[sport].percent, corners[sport].level])
      }
    }
  })

  it('leaves a sport with no grade off every rung', () => {
    const ladder = levelLadder({ ...NO_TRIANGLE_GRADES, ride: graded(0.95) })
    expect(ladder.flatMap((rung) => rung.sports)).toEqual([{ sport: 'ride', percent: 95 }])
    expect(ladder[0]?.sports).toEqual([{ sport: 'ride', percent: 95 }])
  })
})
