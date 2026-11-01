import { trainingWeeks } from '@rca/core/history'
import { describe, expect, it } from 'vitest'
import { calendarOf } from '../calendarFixtures'
import type { DaySpec } from '../calendarFixtures'
import { findingsOf, findingsText } from './calendarFindings'

// Mondays 4, 11 and 18 March 2024 trained, the 25th a week of rest, then 1 and 8 April.
const DAYS: DaySpec[] = [
  { on: [2024, 3, 5], run: [2, 1] },
  { on: [2024, 3, 12], run: [5.5, 2] },
  { on: [2024, 3, 19], run: [1, 1] },
  { on: [2024, 4, 2], run: [1, 1], ride: [4, 1] },
  { on: [2024, 4, 9], run: [3, 1] },
]
const weeks = trainingWeeks(calendarOf(DAYS))

describe('findingsOf', () => {
  it('finds the longest run of weeks with training, and the week with the most hours', () => {
    const found = findingsOf(weeks, 'all')!
    expect(found.streakWeeks).toBe(3)
    expect(found.streakEndDay).toBe(weeks[2]!.mondayDay)
    expect(found.bigHours).toBe(5.5)
    expect(found.bigDay).toBe(weeks[1]!.mondayDay)
  })

  it('reads only the sport of the filter', () => {
    const ride = findingsOf(weeks, 'ride')!
    expect(ride).toMatchObject({ streakWeeks: 1, bigHours: 4, streakEndDay: weeks[4]!.mondayDay })
    const run = findingsOf(weeks, 'run')!
    expect(run.streakWeeks).toBe(3)
  })

  it('takes the latest of two equal streaks, and is null without training', () => {
    const tied = trainingWeeks(
      calendarOf([
        { on: [2024, 3, 5], run: [1, 1] },
        { on: [2024, 3, 12], run: [1, 1] },
        { on: [2024, 4, 2], run: [1, 1] },
        { on: [2024, 4, 9], run: [1, 1] },
      ]),
    )
    expect(findingsOf(tied, 'all')!.streakEndDay).toBe(tied.at(-1)!.mondayDay)
    expect(findingsOf([], 'all')).toBeNull()
    expect(
      findingsOf(trainingWeeks(calendarOf([{ on: [2024, 3, 5], run: [1, 1] }])), 'ride'),
    ).toBeNull()
  })
})

describe('findingsText', () => {
  it('says the streak and the biggest week in two short sentences with their dates', () => {
    expect(findingsText(findingsOf(weeks, 'all')!, 'all')).toBe(
      'Your longest streak was 3 weeks, ending the week of 18 Mar 2024. ' +
        'Your biggest week was 5.5 hours, in the week of 11 Mar 2024.',
    )
  })

  it('names the sport when the filter keeps one, and writes one week as a week', () => {
    expect(findingsText(findingsOf(weeks, 'ride')!, 'ride')).toBe(
      'Your longest riding streak was 1 week, ending the week of 1 Apr 2024. ' +
        'Your biggest riding week was 4.0 hours, in the week of 1 Apr 2024.',
    )
  })
})
