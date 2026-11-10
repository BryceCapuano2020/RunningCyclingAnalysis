import { describe, expect, it } from 'vitest'
import type { Grade, SportGrade } from '../grade'
import { NO_TRIANGLE_GRADES, triangleGeometry } from './triangle'
import type { TriangleGrade, TriangleGrades } from './triangle'

const grade = (value: number): Grade => ({ grade: value, level: 'x' })
const graded = (centre: number, low?: number, high?: number): TriangleGrade => {
  const sport: SportGrade = {
    centre: grade(centre),
    range: low === undefined || high === undefined ? null : { low: grade(low), high: grade(high) },
  }
  return { kind: 'graded', grade: sport }
}
const gap: TriangleGrade = { kind: 'gap' }
const all = (run: TriangleGrade, ride: TriangleGrade, lift: TriangleGrade): TriangleGrades => ({
  run,
  ride,
  lift,
})

describe('triangleGeometry', () => {
  const full = triangleGeometry(all(graded(0.6, 0.55, 0.65), graded(0.5), graded(0.4)), 300)

  it('puts run at the top, cycling lower right and lifting lower left, at 100% on the outer ring', () => {
    const { run, ride, lift } = full.corners
    expect(run.tip.x).toBeCloseTo(150)
    expect(run.tip.y).toBeCloseTo(175 - 118)
    expect(ride.tip.x).toBeGreaterThan(150)
    expect(lift.tip.x).toBeCloseTo(300 - ride.tip.x)
    expect(ride.tip.y).toBeCloseTo(lift.tip.y)
    expect(ride.tip.y).toBeGreaterThan(175)
    expect(full.rings.map((ring) => ring.percent)).toEqual([100, 80, 60])
    expect(full.rings[0]?.points[0]).toEqual(run.tip)
  })

  it('places each dot on its own axis at its grade, linear from the centre', () => {
    const dot = full.corners.run.dot!
    expect(dot.x).toBeCloseTo(150)
    expect(175 - dot.y).toBeCloseTo(0.6 * 118)
    const ride = full.corners.ride.dot!
    expect(Math.hypot(ride.x - 150, ride.y - 175)).toBeCloseTo(0.5 * 118)
  })

  it('draws the range along the axis and the figures as the sport pages print them', () => {
    const { run, ride } = full.corners
    expect(run.range).toEqual({ low: 55, high: 65 })
    expect(run.percent).toBe(60)
    expect(run.level).toBe('Local')
    expect(run.band).toHaveLength(2)
    expect(ride.range).toBeNull()
    expect(ride.band).toBeNull()
    // The percent is floored, so 0.5999 is 59 and Recreational, never 60 and Local.
    const near = triangleGeometry(all(graded(0.5999), gap, gap), 300).corners.run
    expect([near.percent, near.level]).toEqual([59, 'Recreational'])
  })

  it('closes the shape with three dots, leaves a line with two and nothing with one', () => {
    expect(full.shape.closed).toBe(true)
    expect(full.shape.points).toHaveLength(3)
    const two = triangleGeometry(all(graded(0.6), graded(0.5), gap), 300)
    expect(two.shape).toMatchObject({ closed: false })
    expect(two.shape.points).toHaveLength(2)
    expect(triangleGeometry(all(graded(0.6), gap, gap), 300).shape.points).toEqual([])
  })

  it('gives a corner with no grade a cap and no dot or figure', () => {
    const lift = triangleGeometry(all(graded(0.6), graded(0.5), gap), 300).corners.lift
    expect(lift.dot).toBeNull()
    expect(lift.band).toBeNull()
    expect([lift.percent, lift.level, lift.range]).toEqual([null, null, null])
    const [a, b] = lift.cap!
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(12)
  })

  it('draws nothing but axes and rings with no grade at all', () => {
    const empty = triangleGeometry(NO_TRIANGLE_GRADES, 300)
    expect(Object.values(empty.corners).every((corner) => corner.dot === null)).toBe(true)
    expect(empty.shape.points).toEqual([])
    expect(empty.rings).toHaveLength(3)
  })

  it('holds a grade past 100% on the outer ring', () => {
    const top = triangleGeometry(all(graded(1.2), gap, gap), 300).corners.run
    expect(top.dot!.y).toBeCloseTo(top.tip.y)
  })

  it('scales with the size, and is the same figure at any size', () => {
    const big = triangleGeometry(all(graded(0.6), graded(0.5), graded(0.4)), 600)
    const small = triangleGeometry(all(graded(0.6), graded(0.5), graded(0.4)), 300)
    expect(big.corners.ride.dot!.x).toBeCloseTo(small.corners.ride.dot!.x * 2)
    expect(big.radius).toBeCloseTo(small.radius * 2)
  })
})
