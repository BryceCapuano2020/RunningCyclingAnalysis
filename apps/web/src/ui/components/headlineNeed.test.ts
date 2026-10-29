import { describe, expect, it } from 'vitest'
import { makeActivity, makeResult } from './fixtures'
import { heldAction } from './headlineNeed'

const THREE_EACH = [1, 2, 3].flatMap((n) => [
  makeActivity({ id: `run-${n}`, sport: 'run' }),
  makeActivity({ id: `ride-${n}`, sport: 'ride' }),
])
const SHORT = [{ durationS: 300, value: 6, activityId: 'a', startIndex: 0 }]
/** Any effort as long as the headline's counts, hard or easy: the curve holds only its value. */
const EASY_20_MIN = [...SHORT, { durationS: 1200, value: 3, activityId: 'a', startIndex: 0 }]

function held(overrides: Parameters<typeof makeResult>[0]) {
  return makeResult({ activities: THREE_EACH, runCp: null, rideCp: null, ...overrides })
}

describe('heldAction', () => {
  it('asks for the activities a sport is short of, naming the period when it is dated', () => {
    const few = makeResult({ activities: [makeActivity({ id: 'run-1', sport: 'run' })] })
    expect(heldAction(few, undefined)).toBe('Add 2 more runs and 3 more rides to compare them.')
  })

  it('asks for one run or ride of the headline length from the sport that has none, and does not say hard', () => {
    const action = heldAction(held({ runCurve: EASY_20_MIN, rideCurve: SHORT }), undefined)
    expect(action).toBe('Add one ride of 20 min or more to compare them.')
    expect(action).not.toMatch(/hard/i)
  })

  it('names both sports when neither has a best that long', () => {
    expect(heldAction(held({ runCurve: SHORT, rideCurve: SHORT }), undefined)).toBe(
      'Add one run and one ride of 20 min or more to compare them.',
    )
  })

  it('stops asking for a sport once an easy effort of the headline length is on file', () => {
    // An easy 20 minutes gives a best at 20 minutes, which is all the evidence rule reads.
    const lifted = heldAction(held({ runCurve: EASY_20_MIN, rideCurve: EASY_20_MIN }), undefined)
    expect(lifted).not.toMatch(/Add one (run|ride)( and one (run|ride))? of/)
  })
})
