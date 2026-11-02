import { describe, expect, it } from 'vitest'
import { findingAgreeing, profileComparable, profileFinding } from './gradeProfile'
import type { GradeProfile } from './gradeProfile'
import type { Grade, SportGrade } from './grades'

const MIN = 60

const at = (grade: number): Grade => ({ grade, level: 'Local' })

/** A run's grade is a point; a ride's has a range of three points either side. */
const runAt = (fraction: number): SportGrade => ({ centre: at(fraction), range: null })
const rideAt = (fraction: number): SportGrade => ({
  centre: at(fraction),
  range: { low: at(fraction - 0.03), high: at(fraction + 0.03) },
})

/** The run clearly higher, the ride clearly higher, and the two within the ride's range. */
const RUN_UP = [0.7, 0.6] as const
const RIDE_UP = [0.6, 0.7] as const
const LEVEL = [0.61, 0.6] as const

/** A profile with both sports graded at each of the durations, in minutes. */
function profileOf(...cells: (readonly [number, readonly [number, number]])[]): GradeProfile {
  return {
    run: cells.map(([minutes, [run]]) => ({ durationS: minutes * MIN, grade: runAt(run) })),
    ride: cells.map(([minutes, [, ride]]) => ({ durationS: minutes * MIN, grade: rideAt(ride) })),
  }
}

describe('findingAgreeing', () => {
  it('keeps "grade alike" only under a level hero, and never under one that leans', () => {
    const alike = profileOf([5, LEVEL], [10, LEVEL], [20, LEVEL], [60, LEVEL])
    expect(profileFinding(alike)).toBe('Running and cycling grade alike')
    expect(findingAgreeing(alike, 'even')).toBe('Running and cycling grade alike')
    expect(findingAgreeing(alike, 'run')).toBeNull()
    expect(findingAgreeing(alike, 'ride')).toBeNull()
  })

  it('keeps "alike at most lengths" under a level hero only', () => {
    const mostly = profileOf([3, LEVEL], [5, RUN_UP], [10, LEVEL], [20, LEVEL], [30, RIDE_UP])
    expect(profileFinding(mostly)).toBe('Running and cycling grade alike at most lengths')
    expect(findingAgreeing(mostly, 'even')).toBe('Running and cycling grade alike at most lengths')
    expect(findingAgreeing(mostly, 'run')).toBeNull()
  })

  it('keeps a lead of one sport only under a hero that leans to that sport', () => {
    const running = profileOf([10, RUN_UP], [20, RUN_UP], [90, RUN_UP])
    expect(findingAgreeing(running, 'run')).toBe('Running grades higher at every length')
    expect(findingAgreeing(running, 'ride')).toBeNull()
    expect(findingAgreeing(running, 'even')).toBeNull()
    const cycling = profileOf([10, RIDE_UP], [20, RIDE_UP], [90, RIDE_UP])
    expect(findingAgreeing(cycling, 'ride')).toBe('Cycling grades higher at every length')
    expect(findingAgreeing(cycling, 'run')).toBeNull()
  })

  it('drops a lead that spans every length but for a dip when the hero leans the other way', () => {
    const dip = profileOf([5, RUN_UP], [10, RUN_UP], [20, LEVEL], [30, RUN_UP])
    expect(findingAgreeing(dip, 'run')).toBe('Running grades higher at most lengths')
    expect(findingAgreeing(dip, 'ride')).toBeNull()
  })

  it('keeps a change of hands when the sport at 20 min is the hero’s, and drops it when it is not', () => {
    const crossover = profileOf(
      [3, RIDE_UP],
      [5, RIDE_UP],
      [7, RIDE_UP],
      [20, RUN_UP],
      [60, RUN_UP],
    )
    const text = 'Cycling grades higher at 3 to 7 min, running at 20 to 60 min'
    expect(profileFinding(crossover)).toBe(text)
    expect(findingAgreeing(crossover, 'run')).toBe(text)
    // The run is higher at 20 min by the range, which a hero leaning to the ride contradicts.
    expect(findingAgreeing(crossover, 'ride')).toBeNull()
  })

  it('keeps a change of hands whose 20 min is an exception when the hero leans to a sport it names', () => {
    const between = profileOf([3, RUN_UP], [5, RUN_UP], [10, LEVEL], [30, RIDE_UP], [60, RIDE_UP])
    const text = 'Running grades higher at 3 to 5 min, cycling at 30 to 60 min'
    expect(findingAgreeing(between, 'ride')).toBe(text)
    expect(findingAgreeing(between, 'run')).toBe(text)
    expect(findingAgreeing(between, 'even')).toBeNull()
  })

  it('says nothing without a hero lean, or with fewer than two durations graded in both sports', () => {
    const running = profileOf([10, RUN_UP], [20, RUN_UP], [90, RUN_UP])
    expect(findingAgreeing(running, null)).toBeNull()
    const one = profileOf([20, RUN_UP])
    expect(findingAgreeing(one, 'run')).toBeNull()
    expect(profileComparable(one)).toBe(false)
    expect(profileComparable(running)).toBe(true)
    expect(profileComparable({ run: [], ride: [] })).toBe(false)
  })
})
