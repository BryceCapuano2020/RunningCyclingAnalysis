import { describe, expect, it } from 'vitest'
import { makeActivity, makeResult } from '../components/fixtures'
import { SET_ASIDE_ACTIVITY_TEXT, setAsideText } from './setAsideCopy'

describe('set-aside heart rate copy', () => {
  it('says nothing when no heart rate is set aside', () => {
    expect(setAsideText(makeResult())).toBeNull()
  })

  it('counts the runs and rides whose heart rate is left out, and gives the rule', () => {
    const activities = [
      makeActivity({ id: 'r1', sport: 'ride' }),
      makeActivity({ id: 'r2', sport: 'ride' }),
      makeActivity({ id: 'n1', sport: 'run' }),
      makeActivity({ id: 'kept', sport: 'ride' }),
    ]
    const text = setAsideText(makeResult({ activities, heartRateSetAside: ['n1', 'r1', 'r2'] }))
    expect(text).toBe(
      'Heart rate from 1 run and 2 rides is left out: on each, it stayed under 70% of your ' +
        'reference heart rate through 10 min or more at or above your threshold, which a working ' +
        'sensor would not show.',
    )
  })

  it('names the same rule on the activity', () => {
    expect(SET_ASIDE_ACTIVITY_TEXT).toContain(
      'under 70% of your reference heart rate through 10 min',
    )
  })
})
