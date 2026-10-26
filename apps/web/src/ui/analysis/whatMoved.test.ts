import { describe, expect, it } from 'vitest'
import { HEADLINE_DURATION_S, PRIORS } from '@rca/core/constants'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { AthleteSettings, Comparison, Interval } from '@rca/core/types'
import { curvePoint } from '../charts/fixtures'
import {
  FIVE_K_IN_20_MIN_WKG,
  MAN_BORN_1986,
  comparisonPoint,
  interval,
  makeActivity,
  makeEquivalence,
  makeResult,
} from '../components/fixtures'
import type { ImportChange } from './importState'
import { listedMoves, whatMoved } from './whatMoved'

const SETTINGS: AthleteSettings = { massKg: 70, bikeMassKg: 9 }

/** A critical-power fit with threshold `cp`, in the metabolic W/kg that running is fitted in. */
function fit(cp: number) {
  return { cp, wPrime: 20, cpSe: 0.05, r2: 0.99, nPoints: 6 }
}

/** The cycling fit whose threshold is `watts` at the test mass and the prior-mean efficiency. */
function rideFit(watts: number) {
  return fit(watts / (PRIORS.grossEfficiency.mean * SETTINGS.massKg))
}

function balance(ratio: Interval): Comparison {
  return { prior: [comparisonPoint({ ratio })], calibrated: null }
}

const RUN = makeActivity({ id: 'run-1', sport: 'run' })
const RIDE = makeActivity({ id: 'ride-1', sport: 'ride', name: 'Hill ride' })
// Workouts the import added start later than the ones on file.
const LATER = Date.UTC(2026, 0, 9, 7, 30)
const NEW_RUN = makeActivity({ id: 'run-2', sport: 'run', name: 'Tempo run', startMs: LATER })
const NEW_RIDE = makeActivity({ id: 'ride-2', sport: 'ride', name: 'Long ride', startMs: LATER })

/** A result with a 7:12 /mi running threshold, a 250 W cycling threshold and a 12% run lead. */
function resultWith(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return makeResult({
    activities: [RUN, RIDE],
    runCp: fit(15.749),
    rideCp: rideFit(250),
    comparison: balance(interval(1.05, 1.12, 1.2)),
    ...overrides,
  })
}

describe('whatMoved: thresholds', () => {
  it('lists a running threshold whose displayed pace moved, in the unit preference', () => {
    const before = resultWith({ runCp: fit(15.749) })
    const after = resultWith({ runCp: fit(15.988) })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([
      {
        text: 'Threshold pace: 7:12 → 7:05 /mi',
        spoken: 'Threshold pace from 7:12 to 7:05 per mile',
      },
    ])
    expect(whatMoved(before, after, SETTINGS, 'metric', null)).toEqual([
      {
        text: 'Threshold pace: 4:28 → 4:24 /km',
        spoken: 'Threshold pace from 4:28 to 4:24 per kilometre',
      },
    ])
  })

  it('lists a cycling threshold in watts', () => {
    const before = resultWith({ rideCp: rideFit(225) })
    const after = resultWith({ rideCp: rideFit(231) })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([
      {
        text: 'Threshold power: 225 → 231 W',
        spoken: 'Threshold power from 225 to 231 watts',
      },
    ])
  })

  it('leaves out a threshold whose displayed value did not change, however small the change', () => {
    const before = resultWith({ runCp: fit(15.749) })
    const after = resultWith({ runCp: fit(15.7492) })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([])
  })

  it('does not list a threshold that had no value before the import', () => {
    const before = resultWith({ runCp: null })
    const after = resultWith({ runCp: fit(15.988) })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([])
  })
})

describe('whatMoved: balance', () => {
  it('says the balance leans less toward running, with the range centre before and after', () => {
    const before = resultWith({ comparison: balance(interval(1.05, 1.12, 1.2)) })
    const after = resultWith({ comparison: balance(interval(1.02, 1.08, 1.14)) })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([
      {
        text: 'Your balance now leans less toward running (12% → 8%)',
        spoken: 'Your balance now leans less toward running, from 12% to 8%',
      },
    ])
  })

  it('says the balance leans more toward running when the lead grows', () => {
    const before = resultWith({ comparison: balance(interval(1.02, 1.08, 1.14)) })
    const after = resultWith({ comparison: balance(interval(1.05, 1.12, 1.2)) })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([
      {
        text: 'Your balance now leans more toward running (8% → 12%)',
        spoken: 'Your balance now leans more toward running, from 8% to 12%',
      },
    ])
  })

  it('reads a cycling lead as cycling, with its own centre', () => {
    const before = resultWith({ comparison: balance(interval(0.8, 0.9, 0.95)) })
    const after = resultWith({ comparison: balance(interval(0.9, 0.95, 0.99)) })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([
      {
        text: 'Your balance now leans less toward cycling (11% → 5%)',
        spoken: 'Your balance now leans less toward cycling, from 11% to 5%',
      },
    ])
  })

  it('says the balance now leans toward cycling when the lean changes sport', () => {
    const after = resultWith({ comparison: balance(interval(0.8, 0.9, 0.95)) })
    expect(whatMoved(resultWith(), after, SETTINGS, 'imperial', null)).toEqual([
      { text: 'Your balance now leans toward cycling' },
    ])
  })

  it('says running and cycling are now in balance when the range includes even', () => {
    const after = resultWith({ comparison: balance(interval(0.97, 1.01, 1.05)) })
    expect(whatMoved(resultWith(), after, SETTINGS, 'imperial', null)).toEqual([
      { text: 'Your running and cycling are now in balance' },
    ])
  })

  it('says the balance leans toward running when it was in balance before', () => {
    const before = resultWith({ comparison: balance(interval(0.95, 1.0, 1.05)) })
    const after = resultWith({ comparison: balance(interval(1.02, 1.06, 1.1)) })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([
      { text: 'Your balance now leans toward running' },
    ])
  })

  it('lists nothing when the lead still rounds to the same whole percent', () => {
    const before = resultWith({ comparison: balance(interval(1.05, 1.1249, 1.2)) })
    const after = resultWith({ comparison: balance(interval(1.05, 1.1151, 1.2)) })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([])
  })

  it('lists nothing for a balance that stays in balance', () => {
    const before = resultWith({ comparison: balance(interval(0.95, 1.0, 1.05)) })
    const after = resultWith({ comparison: balance(interval(0.97, 1.0, 1.03)) })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([])
  })
})

describe('whatMoved: bests', () => {
  it('lists a duration best set by an activity the import added, in the sport unit', () => {
    const before = resultWith({ runCurve: [curvePoint(1200, 15.749, 'run-1')] })
    const after = resultWith({
      activities: [RUN, RIDE, NEW_RUN],
      runCurve: [curvePoint(1200, 15.988, 'run-2')],
    })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([
      {
        text: 'New best 20 min run: 7:05 /mi',
        spoken: 'New best 20 minutes run: 7 minutes 5 seconds per mile',
      },
    ])
  })

  it('lists a cycling best in watts, and a best with no earlier value', () => {
    const before = resultWith({ rideCurve: [curvePoint(1200, Number.NaN, null)] })
    const after = resultWith({
      activities: [RUN, RIDE, NEW_RIDE],
      rideCurve: [curvePoint(1200, 262, 'ride-2'), curvePoint(3600, 210, 'ride-2')],
    })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([
      {
        text: 'New best 20 min ride: 262 W',
        spoken: 'New best 20 minutes ride: 262 watts',
      },
      {
        text: 'New best 60 min ride: 210 W',
        spoken: 'New best 1 hour ride: 210 watts',
      },
    ])
  })

  it('lists the run best before the ride best', () => {
    const before = resultWith({
      runCurve: [curvePoint(1200, 15.749, 'run-1')],
      rideCurve: [curvePoint(1200, 250, 'ride-1')],
    })
    const after = resultWith({
      activities: [RUN, RIDE, NEW_RUN, NEW_RIDE],
      runCurve: [curvePoint(1200, 15.988, 'run-2')],
      rideCurve: [curvePoint(1200, 262, 'ride-2')],
    })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([
      {
        text: 'New best 20 min run: 7:05 /mi',
        spoken: 'New best 20 minutes run: 7 minutes 5 seconds per mile',
      },
      {
        text: 'New best 20 min ride: 262 W',
        spoken: 'New best 20 minutes ride: 262 watts',
      },
    ])
  })

  it('does not list a best that an activity already on file set', () => {
    const before = resultWith({ rideCurve: [curvePoint(1200, 250, 'ride-1')] })
    const after = resultWith({ rideCurve: [curvePoint(1200, 262, 'ride-1')] })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([])
  })

  it('does not list a best that is lower than the earlier one, even from a new activity', () => {
    const before = resultWith({ rideCurve: [curvePoint(1200, 250, 'ride-1')] })
    const after = resultWith({
      activities: [RUN, RIDE, NEW_RIDE],
      rideCurve: [curvePoint(1200, 240, 'ride-2')],
    })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([])
  })

  it('does not list a best whose displayed watts did not change', () => {
    const before = resultWith({ rideCurve: [curvePoint(1200, 250, 'ride-1')] })
    const after = resultWith({
      activities: [RUN, RIDE, NEW_RIDE],
      rideCurve: [curvePoint(1200, 250.4, 'ride-2')],
    })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([])
  })

  it('lists only the record durations: 1, 5, 20 and 60 minutes', () => {
    const before = resultWith()
    const after = resultWith({
      activities: [RUN, RIDE, NEW_RIDE],
      rideCurve: [curvePoint(600, 300, 'ride-2')],
    })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([])
  })
})

describe('whatMoved: distance bests', () => {
  // A run that covers the half marathon in 1:27:54 (5274 s).
  const HALF = makeActivity({
    id: 'half-1',
    sport: 'run',
    name: 'Spring half',
    startMs: LATER,
    distanceBests: [{ distanceM: 21097.5, seconds: 5274 }],
  })

  it('lists a distance best set by an activity the import added, with its time', () => {
    const before = resultWith({ activities: [{ ...RUN, distanceBests: [] }, RIDE] })
    const after = resultWith({ activities: [RUN, RIDE, HALF] })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([
      {
        text: 'New best half marathon: 1:27:54',
        spoken: 'New best half marathon: 1 hour 27 minutes 54 seconds',
      },
    ])
  })

  it('does not list a distance best that is no faster than the one on file', () => {
    const onFile = makeActivity({
      id: 'run-1',
      sport: 'run',
      distanceBests: [{ distanceM: 21097.5, seconds: 5000 }],
    })
    const before = resultWith({ activities: [onFile, RIDE] })
    const after = resultWith({ activities: [onFile, RIDE, HALF] })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([])
  })

  it('does not count a distance best whose workout was on file under another activity id', () => {
    const replaced = makeActivity({
      id: 'half-1b',
      sport: 'run',
      name: 'Spring half',
      startMs: LATER,
      distanceBests: [{ distanceM: 21097.5, seconds: 5274 }],
    })
    const earlier = makeActivity({ ...HALF, id: 'half-1-old', startMs: LATER })
    const before = resultWith({ activities: [earlier, RIDE] })
    const after = resultWith({ activities: [replaced, RIDE] })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([])
  })

  it('does not count a faster distance best whose workout was on file under another id', () => {
    const earlier = makeActivity({ ...HALF, id: 'half-1-old', startMs: LATER })
    // 5200 s beats the 5274 s on file, so only the on-file check keeps it out of the list.
    const faster = makeActivity({
      id: 'half-1b',
      sport: 'run',
      name: 'Spring half',
      startMs: LATER,
      distanceBests: [{ distanceM: 21097.5, seconds: 5200 }],
    })
    const before = resultWith({ activities: [earlier, RIDE] })
    const after = resultWith({ activities: [faster, RIDE] })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([])
  })

  it('does not list a distance best that only ties the one on file', () => {
    // The import adds a workout that started earlier and ties the time on file, so it holds the tie.
    const onFile = makeActivity({
      id: 'run-1',
      sport: 'run',
      startMs: LATER,
      distanceBests: [{ distanceM: 21097.5, seconds: 5274 }],
    })
    const earlierTie = makeActivity({
      id: 'half-early',
      sport: 'run',
      name: 'Early half',
      startMs: LATER - 86_400_000,
      distanceBests: [{ distanceM: 21097.5, seconds: 5274 }],
    })
    const before = resultWith({ activities: [onFile, RIDE] })
    const after = resultWith({ activities: [onFile, RIDE, earlierTie] })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([])
  })

  it('lists no distance best while a run on file predates distance bests, since it may hold a faster one', () => {
    // The older run has no distance bests field, so its half marathon time is unknown.
    const older = makeActivity({ id: 'run-0', sport: 'run', name: 'Old run', startMs: 1 })
    const before = resultWith({ activities: [older, RIDE] })
    const after = resultWith({ activities: [older, RIDE, HALF] })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([])
  })
})

describe('whatMoved: order, cap, first import and sample', () => {
  it('lists thresholds, then balance, then bests, and no more than four in all', () => {
    const before = resultWith({
      rideCp: rideFit(225),
      runCurve: [curvePoint(1200, 15.749, 'run-1')],
      rideCurve: [curvePoint(1200, 250, 'ride-1')],
    })
    const after = resultWith({
      activities: [RUN, RIDE, NEW_RUN, NEW_RIDE],
      runCp: fit(15.988),
      rideCp: rideFit(231),
      comparison: balance(interval(1.02, 1.08, 1.14)),
      runCurve: [curvePoint(1200, 15.988, 'run-2')],
      rideCurve: [curvePoint(1200, 262, 'ride-2')],
    })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null).map((item) => item.text)).toEqual([
      'Threshold pace: 7:12 → 7:05 /mi',
      'Threshold power: 225 → 231 W',
      'Your balance now leans less toward running (12% → 8%)',
      'New best 20 min run: 7:05 /mi',
    ])
  })

  it('lists nothing for a first import, which has nothing to compare with', () => {
    expect(whatMoved(null, resultWith(), SETTINGS, 'imperial', null)).toEqual([])
  })

  it('lists nothing when nothing moved', () => {
    expect(whatMoved(resultWith(), resultWith(), SETTINGS, 'imperial', null)).toEqual([])
  })
})

describe('whatMoved: balance headlines compare like with like', () => {
  it('lists nothing when the two balances were compared at different durations', () => {
    const before = resultWith({
      comparison: {
        prior: [comparisonPoint({ durationS: 300, ratio: interval(1.05, 1.12, 1.2) })],
        calibrated: null,
      },
    })
    const after = resultWith({ comparison: balance(interval(1.02, 1.08, 1.14)) })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([])
  })

  it('lists nothing when one balance is calibrated by heart rate and the other is not', () => {
    const before = resultWith({ comparison: balance(interval(1.05, 1.12, 1.2)) })
    const after = resultWith({
      comparison: {
        prior: [comparisonPoint({ ratio: interval(1.05, 1.12, 1.2) })],
        calibrated: [comparisonPoint({ ratio: interval(1.02, 1.08, 1.14) })],
      },
    })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([])
  })
})

describe('whatMoved: every lean change', () => {
  it('says the balance now leans toward running after it leaned toward cycling', () => {
    const before = resultWith({ comparison: balance(interval(0.8, 0.9, 0.95)) })
    expect(whatMoved(before, resultWith(), SETTINGS, 'imperial', null)).toEqual([
      { text: 'Your balance now leans toward running' },
    ])
  })

  it('says running and cycling are now in balance after the balance leaned toward cycling', () => {
    const before = resultWith({ comparison: balance(interval(0.8, 0.9, 0.95)) })
    const after = resultWith({ comparison: balance(interval(0.97, 1.01, 1.05)) })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([
      { text: 'Your running and cycling are now in balance' },
    ])
  })

  it('says the balance now leans toward cycling after it was in balance', () => {
    const before = resultWith({ comparison: balance(interval(0.95, 1.0, 1.05)) })
    const after = resultWith({ comparison: balance(interval(0.8, 0.9, 0.95)) })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([
      { text: 'Your balance now leans toward cycling' },
    ])
  })

  it('says the cycling lead grew, more toward cycling', () => {
    const before = resultWith({ comparison: balance(interval(0.9, 0.95, 0.99)) })
    const after = resultWith({ comparison: balance(interval(0.8, 0.9, 0.95)) })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([
      {
        text: 'Your balance now leans more toward cycling (5% → 11%)',
        spoken: 'Your balance now leans more toward cycling, from 5% to 11%',
      },
    ])
  })
})

describe('whatMoved: bests from workouts not on file', () => {
  it('does not count a best whose workout was on file under another activity id', () => {
    const replaced = makeActivity({
      id: 'run-1b',
      sport: 'run',
      name: 'Morning run',
      startMs: RUN.startMs,
    })
    const before = resultWith({ runCurve: [curvePoint(1200, 15.749, 'run-1')] })
    const after = resultWith({
      activities: [replaced, RIDE],
      runCurve: [curvePoint(1200, 15.988, 'run-1b')],
    })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null)).toEqual([])
  })
})

describe('listedMoves', () => {
  const ADDED: ImportChange['outcome'] = {
    activities: 2,
    rejected: 0,
    duplicates: [],
    runs: 1,
    rides: 1,
    firstStartMs: Date.UTC(2026, 0, 5),
    lastStartMs: Date.UTC(2026, 0, 9),
  }

  it('lists what moved when the summary says something was added', () => {
    const change: ImportChange = {
      outcome: ADDED,
      before: resultWith(),
      after: resultWith({ runCp: fit(15.988) }),
    }
    expect(listedMoves(change, SETTINGS, 'imperial', null).map((item) => item.text)).toEqual([
      'Threshold pace: 7:12 → 7:05 /mi',
    ])
  })

  it('lists nothing when the import added no run or ride, though the numbers moved', () => {
    const change: ImportChange = {
      outcome: { ...ADDED, runs: 0, rides: 0 },
      before: resultWith(),
      after: resultWith({ runCp: fit(15.988) }),
    }
    expect(listedMoves(change, SETTINGS, 'imperial', null)).toEqual([])
  })

  it('lists nothing without a change, or without a result after the import', () => {
    expect(listedMoves(null, SETTINGS, 'imperial', null)).toEqual([])
    const change: ImportChange = { outcome: ADDED, before: resultWith(), after: null }
    expect(listedMoves(change, SETTINGS, 'imperial', null)).toEqual([])
  })
})

/** A result whose run and ride both reach a 20-minute grade: the run at the 5 km pace, the ride at `rideSpeedMs`. */
function gradedResult(
  rideSpeedMs: number,
  overrides: Partial<AnalysisResult> = {},
): AnalysisResult {
  return makeResult({
    activities: [RUN, RIDE],
    runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
    rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
    equivalents: [
      makeEquivalence({
        durationS: HEADLINE_DURATION_S,
        runSpeed: interval(rideSpeedMs, rideSpeedMs, rideSpeedMs),
      }),
    ],
    comparison: balance(interval(1.05, 1.12, 1.2)),
    ...overrides,
  })
}

describe('whatMoved: balance in grade points', () => {
  it('says how the lead in points moved when both results grade both sports', () => {
    // A slower ride lowers its grade, so the run leads by more.
    const before = gradedResult(3.8)
    const after = gradedResult(3.5)
    const texts = whatMoved(before, after, SETTINGS, 'metric', MAN_BORN_1986).map(
      (item) => item.text,
    )
    expect(texts).toContainEqual(
      expect.stringMatching(
        /^Your balance now leans more toward running \(\d+ points? → \d+ points?\)$/,
      ),
    )
  })

  it('says the balance now leans toward cycling when the grade gap crosses zero', () => {
    const before = gradedResult(3.8)
    const after = gradedResult(5.0)
    const texts = whatMoved(before, after, SETTINGS, 'metric', MAN_BORN_1986).map(
      (item) => item.text,
    )
    expect(texts).toContain('Your balance now leans toward cycling')
  })

  it('lists no balance when one side has grades and the other has only the energy ratio', () => {
    const before = gradedResult(3.8)
    const after = resultWith({ comparison: balance(interval(1.02, 1.08, 1.14)) })
    const texts = whatMoved(before, after, SETTINGS, 'metric', MAN_BORN_1986).map(
      (item) => item.text,
    )
    expect(texts.some((text) => /balance/.test(text))).toBe(false)
  })
})

describe('whatMoved while no weight is entered', () => {
  it('lists the running threshold but holds the ride threshold until a weight is entered', () => {
    const before = resultWith({ runCp: fit(15.749), rideCp: rideFit(250) })
    const after = resultWith({ runCp: fit(15.988), rideCp: rideFit(300) })
    const held = whatMoved(before, after, SETTINGS, 'imperial', null, false).map(
      (item) => item.text,
    )
    expect(held).toEqual(['Threshold pace: 7:12 → 7:05 /mi'])
    const weighed = whatMoved(before, after, SETTINGS, 'imperial', null, true).map(
      (item) => item.text,
    )
    expect(weighed).toContain('Threshold pace: 7:12 → 7:05 /mi')
    expect(weighed.some((text) => text.startsWith('Threshold power'))).toBe(true)
  })

  it('keeps the running best but holds the cycling best until a weight is entered', () => {
    const before = resultWith({
      runCurve: [curvePoint(1200, 15.749, 'run-1')],
      rideCurve: [curvePoint(1200, Number.NaN, null)],
    })
    const after = resultWith({
      activities: [RUN, RIDE, NEW_RUN, NEW_RIDE],
      runCurve: [curvePoint(1200, 15.988, 'run-2')],
      rideCurve: [curvePoint(1200, 262, 'ride-2')],
    })
    const held = whatMoved(before, after, SETTINGS, 'imperial', null, false).map(
      (item) => item.text,
    )
    expect(held).toEqual(['New best 20 min run: 7:05 /mi'])
    const weighed = whatMoved(before, after, SETTINGS, 'imperial', null, true).map(
      (item) => item.text,
    )
    expect(weighed).toContain('New best 20 min ride: 262 W')
  })

  it('holds the balance line, since the ride is part of it', () => {
    const before = resultWith({ comparison: balance(interval(1.05, 1.12, 1.2)) })
    const after = resultWith({ comparison: balance(interval(1.02, 1.08, 1.14)) })
    expect(whatMoved(before, after, SETTINGS, 'imperial', null, false)).toEqual([])
    expect(whatMoved(before, after, SETTINGS, 'imperial', null, true)).toHaveLength(1)
  })
})
