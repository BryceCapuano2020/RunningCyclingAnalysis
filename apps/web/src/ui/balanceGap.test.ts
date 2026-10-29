import { describe, expect, it } from 'vitest'
import type { Grade, GradeOutcome, HeadlineGrades, SportGrade } from './grades'
import { balanceGap, gapOfHeadline } from './balanceGap'
import { formatGrade } from './gradeFormat'

/** A grade from its fraction, as ageGrade gives it. The level does not affect the gap. */
function grade(fraction: number): Grade {
  return { grade: fraction, level: 'Local' }
}

/** A run's grade: one activity's estimate, so it has no range. */
function run(fraction: number): SportGrade {
  return { centre: grade(fraction), range: null }
}

/** A ride's grade with its model range, from the low end to the high end. */
function ride(centre: number, low: number, high: number): SportGrade {
  return { centre: grade(centre), range: { low: grade(low), high: grade(high) } }
}

/** A ride's grade with no range, as a point estimate. */
function rideAt(fraction: number): SportGrade {
  return { centre: grade(fraction), range: null }
}

const GRADED: GradeOutcome = {
  kind: 'graded',
  age: 40,
  grade: run(0.64),
}

describe('balanceGap', () => {
  it('is the run grade less the ride grade, in whole points', () => {
    const gap = balanceGap(run(0.64), rideAt(0.58))
    expect(gap.centre).toBe(6)
    expect(gap.lean).toBe('run')
  })

  it('takes the ride range as the gap range when the run grade is a single point', () => {
    const gap = balanceGap(run(0.64), ride(0.58, 0.52, 0.64))
    expect(gap.centre).toBe(6)
    expect(gap.low).toBe(0)
    expect(gap.high).toBe(12)
  })

  it('takes the run range into the gap too, so a range on either sport widens it', () => {
    const runWithRange: SportGrade = {
      centre: grade(0.64),
      range: { low: grade(0.6), high: grade(0.68) },
    }
    const gap = balanceGap(runWithRange, rideAt(0.58))
    expect(gap.low).toBe(2)
    expect(gap.high).toBe(10)
  })

  it('is the difference of the whole percents the cards show: 64% and 58% make 6 points', () => {
    expect(formatGrade(0.6451)).toBe('64%')
    expect(formatGrade(0.5849)).toBe('58%')
    expect(balanceGap(run(0.6451), rideAt(0.5849)).centre).toBe(6)
  })

  it('keeps the centre inside its range, whatever the grades', () => {
    for (const [runFraction, rideFraction, low, high] of [
      [0.5, 0.45, 0.4, 0.5],
      [0.7, 0.6, 0.55, 0.66],
      [0.3, 0.9, 0.85, 0.95],
    ] as const) {
      const gap = balanceGap(run(runFraction), ride(rideFraction, low, high))
      expect(gap.low).toBeLessThanOrEqual(gap.centre)
      expect(gap.centre).toBeLessThanOrEqual(gap.high)
    }
  })

  it('leans toward running on a 6 point estimate even when its range reaches zero', () => {
    // The gap is 6, its range is 0 to 12: the estimate decides, and the range is stated beside it.
    expect(balanceGap(run(0.64), ride(0.58, 0.52, 0.64)).lean).toBe('run')
  })

  it('leans toward running on a 9 point estimate whose range spans zero', () => {
    // The run grade is 69 and the ride grade 60 with a range of 51 to 73: the gap is 9, -4 to 18.
    const gap = balanceGap(run(0.69), ride(0.6, 0.51, 0.73))
    expect(gap.centre).toBe(9)
    expect(gap.low).toBe(-4)
    expect(gap.high).toBe(18)
    expect(gap.lean).toBe('run')
  })

  it('is even when the estimate is within two points, however wide its range', () => {
    // The run grade is 60 and the ride grade 58 with a range of 50 to 66: the gap is 2, -6 to 10.
    const gap = balanceGap(run(0.6), ride(0.58, 0.5, 0.66))
    expect(gap.centre).toBe(2)
    expect(gap.low).toBeLessThan(0)
    expect(gap.lean).toBe('even')
  })

  it('leans toward running when the whole range is above zero', () => {
    // The run grade is 70 and the ride grade 50 with a range of 46 to 54: the gap is 16 to 24.
    expect(balanceGap(run(0.7), ride(0.5, 0.46, 0.54)).lean).toBe('run')
  })

  it('leans toward cycling when the whole range is below zero', () => {
    expect(balanceGap(run(0.4), rideAt(0.6)).lean).toBe('ride')
  })

  it('is even when the two grades are the same', () => {
    expect(balanceGap(run(0.6), rideAt(0.6)).lean).toBe('even')
    expect(balanceGap(run(0.6), rideAt(0.6)).centre).toBe(0)
  })

  it('reverses its sign when the two sports swap roles', () => {
    const forward = balanceGap(run(0.7), rideAt(0.5))
    const backward = balanceGap(rideAt(0.5), run(0.7))
    expect(backward.centre).toBe(-forward.centre)
    expect(backward.lean).toBe('ride')
  })
})

describe('gapOfHeadline', () => {
  it('is the gap when both sports are graded at the headline duration', () => {
    const headline: HeadlineGrades = {
      run: GRADED,
      ride: { kind: 'graded', age: 40, grade: rideAt(0.58) },
    }
    expect(gapOfHeadline(headline)?.centre).toBe(6)
  })

  it('is null when the run is not graded, so the page falls back to the energy ratio', () => {
    const headline: HeadlineGrades = {
      run: { kind: 'gap', reason: 'no run' },
      ride: { kind: 'graded', age: 40, grade: rideAt(0.58) },
    }
    expect(gapOfHeadline(headline)).toBeNull()
  })

  it('is null when the ride is not graded', () => {
    const headline: HeadlineGrades = {
      run: GRADED,
      ride: { kind: 'gap', reason: 'no ride' },
    }
    expect(gapOfHeadline(headline)).toBeNull()
  })

  it('is null when neither sport is graded', () => {
    const gap: GradeOutcome = { kind: 'gap', reason: 'none' }
    expect(gapOfHeadline({ run: gap, ride: gap })).toBeNull()
  })
})
