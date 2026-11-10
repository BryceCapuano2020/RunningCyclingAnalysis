import { describe, expect, it } from 'vitest'
import type { SportGrade } from '../grade'
import { balanceLead } from './lead'
import type { TriangleGrade, TriangleGrades } from './triangle'
import { comparedGrades, triangleReading } from './triangleLean'

const g = (centre: number, spread = 0): TriangleGrade => {
  const at = (value: number): SportGrade['centre'] => ({ grade: value, level: 'x' })
  const grade: SportGrade = {
    centre: at(centre),
    range: spread === 0 ? null : { low: at(centre - spread), high: at(centre + spread) },
  }
  return { kind: 'graded', grade }
}
const gap: TriangleGrade = { kind: 'gap' }
const of = (run: TriangleGrade, ride: TriangleGrade, lift: TriangleGrade): TriangleGrades => ({
  run,
  ride,
  lift,
})

describe('triangleReading with two graded sports', () => {
  it('is the pair lead, the same figures balanceLead gives', () => {
    const run = g(0.65, 0.05)
    const ride = g(0.56, 0.04)
    const reading = triangleReading(of(run, ride, gap))
    if (run.kind !== 'graded' || ride.kind !== 'graded') throw new Error('graded')
    expect(reading.lead).toEqual(balanceLead(run.grade, ride.grade))
    expect([reading.higher, reading.lower]).toEqual(['run', 'ride'])
    expect(reading.leaders).toEqual(['run'])
    expect(reading.even).toBe(false)
  })

  it('reads the second sport as higher when the lead is negative', () => {
    const reading = triangleReading(of(g(0.5), g(0.6), gap))
    expect([reading.higher, reading.lower, reading.leaders]).toEqual(['ride', 'run', ['ride']])
  })

  it('is even within the rule and reads from the first when level', () => {
    const level = triangleReading(of(g(0.6), g(0.6), gap))
    expect([level.even, level.higher, level.leaders, level.spread]).toEqual([true, 'run', [], 0])
    expect(triangleReading(of(g(0.6), g(0.58), gap)).even).toBe(true)
    expect(triangleReading(of(g(0.6), g(0.57), gap)).even).toBe(false)
  })

  it('pairs any two of the three, in axis order', () => {
    const reading = triangleReading(of(gap, g(0.5), g(0.6)))
    expect([reading.higher, reading.lower, reading.graded]).toEqual([
      'lift',
      'ride',
      ['ride', 'lift'],
    ])
  })
})

describe('triangleReading with three graded sports', () => {
  it('leans toward one sport clearly highest, and states it over the lowest', () => {
    const reading = triangleReading(of(g(0.61), g(0.52), g(0.48)))
    expect(reading.leaders).toEqual(['run'])
    expect([reading.higher, reading.lower, reading.spread]).toEqual(['run', 'lift', 13])
    expect(reading.lead?.centre).toBe(13)
  })

  it('leans toward two sports within the even rule of each other with a third below', () => {
    const reading = triangleReading(of(g(0.61), g(0.6), g(0.48)))
    expect(reading.leaders).toEqual(['run', 'ride'])
    expect([reading.higher, reading.lower]).toEqual(['run', 'lift'])
  })

  it('names the highest alone when the middle sport is not within the rule of it', () => {
    expect(triangleReading(of(g(0.7), g(0.5), g(0.49))).leaders).toEqual(['run'])
  })

  it('is even when all three are within the rule, and says how far apart they sit', () => {
    const reading = triangleReading(of(g(0.6), g(0.59), g(0.58)))
    expect([reading.even, reading.leaders, reading.spread]).toEqual([true, [], 2])
  })

  it('breaks a tie in axis order', () => {
    const reading = triangleReading(of(g(0.4), g(0.6), g(0.6)))
    expect([reading.higher, reading.leaders]).toEqual(['ride', ['ride', 'lift']])
  })
})

describe('triangleReading with fewer than two', () => {
  it('has no lead for one graded sport or none', () => {
    for (const grades of [of(g(0.6), gap, gap), of(gap, gap, gap)]) {
      const reading = triangleReading(grades)
      expect([reading.lead, reading.higher, reading.leaders, reading.even]).toEqual([
        null,
        null,
        [],
        false,
      ])
    }
  })
})

describe('comparedGrades', () => {
  it('leaves lifting out of the lean and the gap, however it grades, and keeps run and ride as they are', () => {
    const grades = of(g(0.61), g(0.52), g(0.9))
    expect(comparedGrades(grades)).toEqual(of(g(0.61), g(0.52), gap))
    const reading = triangleReading(comparedGrades(grades))
    expect(reading.graded).toEqual(['run', 'ride'])
    expect([reading.higher, reading.lower]).toEqual(['run', 'ride'])
  })
})
