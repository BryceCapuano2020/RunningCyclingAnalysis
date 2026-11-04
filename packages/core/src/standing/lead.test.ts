import { describe, expect, it } from 'vitest'
import type { Grade, SportGrade } from '../grade'
import { balanceLead, leanOfLead, leanOfRange, wholePercent } from './lead'

const grade = (value: number): Grade => ({ grade: value, level: 'x' })
const sport = (centre: number, low: number, high: number): SportGrade => ({
  centre: grade(centre),
  range: { low: grade(low), high: grade(high) },
})
const point = (centre: number): SportGrade => ({ centre: grade(centre), range: null })

describe('balanceLead', () => {
  it('combines the two ranges in quadrature, not by their ends', () => {
    // 70 (64 to 76) against 60 (57 to 63): the ends alone would give 1 to 19.
    const lead = balanceLead(sport(0.7, 0.64, 0.76), sport(0.6, 0.57, 0.63))
    expect(lead.centre).toBe(10)
    expect(lead.low).toBe(Math.round(10 - Math.hypot(6, 3)))
    expect(lead.high).toBe(Math.round(10 + Math.hypot(6, 3)))
    expect(lead.lean).toBe('run')
  })

  it('has the range of one sport alone when the other is a point', () => {
    const lead = balanceLead(point(0.65), sport(0.6, 0.55, 0.66))
    expect(lead.centre).toBe(5)
    expect([lead.low, lead.high]).toEqual([-1, 10])
  })

  it('is signed toward the first sport and leans by the estimate to whole points', () => {
    expect(balanceLead(point(0.6), point(0.7)).lean).toBe('ride')
    expect(balanceLead(point(0.601), point(0.6)).lean).toBe('even')
  })
})

describe('the lean rules', () => {
  it('lean by the estimate beyond two whole points, whatever the range', () => {
    expect(leanOfLead({ centre: 9, low: -4, high: 18 })).toBe('run')
    expect(leanOfLead({ centre: -2, low: -30, high: 30 })).toBe('even')
    expect(leanOfRange({ centre: 3, low: 1, high: 5 })).toBe('run')
    expect(leanOfRange({ centre: 3, low: -1, high: 5 })).toBe('even')
  })

  it('floors a grade to the whole percent it is shown as', () => {
    expect(wholePercent(0.8999)).toBe(89)
    expect(wholePercent(0.9)).toBe(90)
  })
})
