import { describe, expect, it } from 'vitest'
import { makeActivity, makeResult } from './fixtures'
import { CLIMB_NEEDED, heldAction, heldReason } from './headlineNeed'

const THREE_EACH = [1, 2, 3].flatMap((n) => [
  makeActivity({ id: `run-${n}`, sport: 'run' }),
  makeActivity({ id: `ride-${n}`, sport: 'ride' }),
])
/** Three rides without a meter, long enough on any road, and three runs. */
const THREE_EACH_NO_METER = THREE_EACH.map((a) =>
  a.sport === 'ride' ? { ...a, powerSource: 'virtual' as const, durationS: 7200 } : a,
)
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

const ASK = `one ride of 20 min or more with a power meter, or with ${CLIMB_NEEDED}`

describe('heldAction for rides known by the model’s watts', () => {
  const noMeter = (overrides: Parameters<typeof makeResult>[0]) =>
    makeResult({ activities: THREE_EACH_NO_METER, runCp: null, rideCp: null, ...overrides })

  it('names the power meter and the climb, not just a longer ride, since the rides on file are long already', () => {
    const action = heldAction(noMeter({ runCurve: EASY_20_MIN, rideCurve: SHORT }), undefined)
    expect(action).toBe(`Add ${ASK} to compare them.`)
  })

  it('asks a run for its length and the ride for its meter or climb when both lack a best', () => {
    expect(heldAction(noMeter({ runCurve: SHORT, rideCurve: SHORT }), undefined)).toBe(
      `Add one run of 20 min or more and ${ASK} to compare them.`,
    )
  })

  it('says the same when some rides have a meter and are short, since a climb in the others would do', () => {
    const mixed = THREE_EACH.map((a, i) =>
      a.sport === 'ride'
        ? { ...a, powerSource: i === 1 ? ('measured' as const) : ('virtual' as const) }
        : a,
    )
    const action = heldAction(
      makeResult({
        activities: mixed,
        runCp: null,
        rideCp: null,
        runCurve: EASY_20_MIN,
        rideCurve: SHORT,
      }),
      undefined,
    )
    expect(action).toBe(`Add ${ASK} to compare them.`)
  })

  it('asks only for length when every ride has a meter', () => {
    const action = heldAction(held({ runCurve: EASY_20_MIN, rideCurve: SHORT }), undefined)
    expect(action).toBe('Add one ride of 20 min or more to compare them.')
  })

  it('says first that no ride records altitude, since then no climb can be found', () => {
    const flat = THREE_EACH_NO_METER.map((a) =>
      Object.assign({}, a, { flagCounts: { 'missing-altitude': 1 } }),
    )
    const action = heldAction(
      makeResult({
        activities: flat,
        runCp: null,
        rideCp: null,
        runCurve: EASY_20_MIN,
        rideCurve: SHORT,
      }),
      undefined,
    )
    expect(action).toBe(
      `None of your rides without a power meter records altitude, so no climb can be found. Add ${ASK} to compare them.`,
    )
  })

  it('does not say no altitude is recorded from a flat profile alone, only from the flag that says it', () => {
    const flat = THREE_EACH_NO_METER.map((a) => Object.assign({}, a, { elevationGainM: 0 }))
    const action = heldAction(
      makeResult({
        activities: flat,
        runCp: null,
        rideCp: null,
        runCurve: EASY_20_MIN,
        rideCurve: SHORT,
      }),
      undefined,
    )
    expect(action).toBe(`Add ${ASK} to compare them.`)
  })

  it('says nothing of climbs once the ride has a best of the headline length', () => {
    const action = heldAction(noMeter({ runCurve: SHORT, rideCurve: EASY_20_MIN }), undefined)
    expect(action).toBe('Add one run of 20 min or more to compare them.')
  })
})

describe('heldReason for rides known by the model’s watts', () => {
  const reason = (activities: typeof THREE_EACH) =>
    heldReason(
      makeResult({
        activities,
        runCp: null,
        rideCp: null,
        runCurve: EASY_20_MIN,
        rideCurve: SHORT,
      }),
      undefined,
    )

  it('says the rides have no power meter and what a ride then needs', () => {
    expect(reason(THREE_EACH_NO_METER)).toBe(
      `Your rides have no power meter, so a ride compares only on ${CLIMB_NEEDED}.`,
    )
  })

  it('says the rides with a meter are short and the rest need a climb, for a mixed library', () => {
    const mixed = THREE_EACH.map((a, i) =>
      a.sport === 'ride'
        ? { ...a, powerSource: i === 1 ? ('measured' as const) : ('virtual' as const) }
        : a,
    )
    expect(reason(mixed)).toBe(
      `None of your rides with a power meter has a best of 20 min, and those without one compare only on ${CLIMB_NEEDED}.`,
    )
  })

  it('says no altitude is recorded when that is why no climb can be found', () => {
    const flat = THREE_EACH_NO_METER.map((a) =>
      Object.assign({}, a, { flagCounts: { 'missing-altitude': 1 } }),
    )
    expect(reason(flat)).toBe(
      'None of your rides without a power meter records altitude, so a ride without one has no climb to compare on.',
    )
  })

  it('names no effort yet, without a climb, for rides a meter measured', () => {
    expect(reason(THREE_EACH)).toBe('Your cycling has no 20 min effort yet.')
  })
})
