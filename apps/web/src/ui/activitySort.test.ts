import { describe, expect, it } from 'vitest'
import { makeActivity } from './components/fixtures'
import { groupByMonth, sortActivities } from './activitySort'

const SHORT = makeActivity({
  id: 'short',
  startMs: new Date(2025, 5, 2, 7).getTime(),
  distanceM: 2000,
  durationS: 900,
  elevationGainM: 5,
})
const LONG = makeActivity({
  id: 'long',
  startMs: new Date(2025, 4, 20, 9).getTime(),
  distanceM: 30000,
  durationS: 7200,
  movingS: 6000,
  elevationGainM: 400,
})
const MIDDLE = makeActivity({
  id: 'middle',
  startMs: new Date(2025, 5, 14, 12).getTime(),
  distanceM: 10000,
  durationS: 3000,
  elevationGainM: 60,
})
/** Newest first, as the library lists them. */
const LIBRARY = [MIDDLE, SHORT, LONG]

function ids(list: { id: string }[]): string[] {
  return list.map((activity) => activity.id)
}

describe('sortActivities', () => {
  it('sorts newest first by start, and oldest first in reverse', () => {
    expect(ids(sortActivities([LONG, SHORT, MIDDLE], 'newest'))).toEqual([
      'middle',
      'short',
      'long',
    ])
    expect(ids(sortActivities(LIBRARY, 'oldest'))).toEqual(['long', 'short', 'middle'])
  })

  it('sorts the longest distance and the most climb first', () => {
    expect(ids(sortActivities(LIBRARY, 'distance'))).toEqual(['long', 'middle', 'short'])
    expect(ids(sortActivities(LIBRARY, 'climb'))).toEqual(['long', 'middle', 'short'])
  })

  it('sorts the longest moving time first', () => {
    expect(ids(sortActivities(LIBRARY, 'time'))).toEqual(['long', 'middle', 'short'])
  })

  it('sorts by elapsed time for an activity whose moving time is not kept', () => {
    const elapsedOnly = makeActivity({ id: 'elapsed', durationS: 6500 })
    expect(ids(sortActivities([MIDDLE, LONG, elapsedOnly], 'time'))).toEqual([
      'elapsed',
      'long',
      'middle',
    ])
  })

  it('leaves the list it was given as it was', () => {
    const given = [LONG, SHORT, MIDDLE]
    sortActivities(given, 'distance')
    expect(ids(given)).toEqual(['long', 'short', 'middle'])
  })
})

describe('groupByMonth', () => {
  it('starts a new group when the month changes, labelled with its month and year', () => {
    const groups = groupByMonth(LIBRARY)
    expect(groups.map((group) => group.label)).toEqual(['Jun 2025', 'May 2025'])
    expect(groups.map((group) => ids(group.items))).toEqual([['middle', 'short'], ['long']])
  })

  it('keeps a group for each year, even when the months repeat across years', () => {
    const lastYear = makeActivity({ id: 'old', startMs: new Date(2024, 5, 1, 9).getTime() })
    expect(groupByMonth([SHORT, lastYear]).map((group) => group.label)).toEqual([
      'Jun 2025',
      'Jun 2024',
    ])
  })
})
