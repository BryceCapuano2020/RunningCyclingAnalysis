import { describe, expect, it } from 'vitest'
import { DAY_MS, DEFAULT_BIKE_MODEL, DURATIONS_S, HEADLINE_DURATION_S } from '../constants'
import { hardEffortRule } from '../digest/hardEffortRule'
import { EVERY_EFFORT, EVERY_EFFORT_KEYED } from '../digest/readingRule'
import { splitPeriods, windowStart } from '../period'
import { AnalysisSession } from '../session'
import type { ActivityDigest, Sport } from '../types'
import { SPORTS } from '../types'
import { earlierComparison } from './earlier'
import type { EarlierInput } from './earlier'
import { canTest, changeEvidence } from './evidence'
import { readingsOf } from './readings'
import { effortLibrary, MONDAY, SETTINGS } from './test/library'
import { callAt, verdictAt } from './types'

const WEEK = 7 * DAY_MS
const HEAD = DURATIONS_S.indexOf(HEADLINE_DURATION_S)
const PERIOD_DAYS = 84

const weekOf = (digest: ActivityDigest): number => Math.floor((digest.startMs - MONDAY) / WEEK)

/** Whether the digest has a reading at the headline length, so counts toward the test. */
const reads = (digest: ActivityDigest): boolean =>
  Number.isFinite(
    digest.curve.find((p) => p.durationS === HEADLINE_DURATION_S)?.value ?? Number.NaN,
  )

/** One sport's activities, 3 a week, in the weeks `[from, to)` of each range only. */
function weeks(sport: Sport, ranges: [number, number][], seed = 1): ActivityDigest[] {
  const last = Math.max(...ranges.map(([, to]) => to))
  return effortLibrary({ sport, perWeek: 3, weeks: last, seed }).filter((digest) =>
    ranges.some(([from, to]) => weekOf(digest) >= from && weekOf(digest) < to),
  )
}

/**
 * The library with only the newest `keep` activities that read at the headline length left in the window `back`
 * periods before the newest period (0 is the period itself); the rest of that window is dropped.
 */
function thinned(library: ActivityDigest[], back: number, keep: number): ActivityDigest[] {
  const { period } = splitPeriods(library, PERIOD_DAYS)
  const from = windowStart(period.startMs!, PERIOD_DAYS, back)
  const to = back === 0 ? period.endMs! + 1 : windowStart(period.startMs!, PERIOD_DAYS, back - 1)
  const inside = (digest: ActivityDigest) => digest.startMs >= from && digest.startMs < to
  const kept = new Set(
    library
      .filter((digest) => inside(digest) && reads(digest))
      .sort((a, b) => b.startMs - a.startMs)
      .slice(0, keep),
  )
  return library.filter((digest) => !inside(digest) || kept.has(digest))
}

/** The input of the last PERIOD_DAYS days of a library, with the period before's test (the shortcut) given or not. */
function inputOf(library: ActivityDigest[], withImmediate: boolean): EarlierInput {
  const { period, selected, previous } = splitPeriods(library, PERIOD_DAYS)
  const immediate =
    withImmediate && previous.length > 0
      ? changeEvidence(selected, previous, SETTINGS, DEFAULT_BIKE_MODEL, null)
      : null
  return {
    period: { startMs: period.startMs!, endMs: period.endMs!, days: PERIOD_DAYS },
    settings: SETTINGS,
    bikeModel: DEFAULT_BIKE_MODEL,
    gate: null,
    rule: EVERY_EFFORT_KEYED,
    immediate,
  }
}

const earlier = (library: ActivityDigest[], withImmediate = false) =>
  earlierComparison(library, inputOf(library, withImmediate))

describe('the window the What changed strip falls back to', () => {
  // Weeks 0 to 10 and 26 to 36 hold runs; the 12 weeks before the newest run are empty, so nothing is there to test against.
  const gap = weeks('run', [
    [0, 10],
    [26, 36],
  ])

  it('walks back over a previous period that holds nothing, to the latest window that can be tested', () => {
    const { period, previous } = splitPeriods(gap, PERIOD_DAYS)
    expect(previous).toEqual([])
    const found = earlier(gap)
    expect(found).not.toBeNull()
    // Two windows back, the same 84 days long, ending where the one after it starts.
    expect(found!.startMs).toBe(windowStart(period.startMs!, PERIOD_DAYS, 2))
    expect(found!.endMs).toBe(windowStart(period.startMs!, PERIOD_DAYS, 1) - 1)
    expect(found!.endMs - found!.startMs + 1).toBe(PERIOD_DAYS * DAY_MS)
    expect(verdictAt(found!.change, 'run', HEADLINE_DURATION_S)).not.toBe('untested')
    expect(found!.previous.runCurve.some((point) => point.value > 0)).toBe(true)
    expect(found!.previous.rideCurve.every((point) => Number.isNaN(point.value))).toBe(true)
  })

  it('is null when the period before already tests the sport, with or without the shortcut', () => {
    const dense = weeks('run', [[0, 36]])
    expect(earlier(dense)).toBeNull()
    expect(earlier(dense, true)).toBeNull()
  })

  it('answers the same through the shortcut as through the walk', () => {
    // A thin period before: its test is untested, so the shortcut walks too.
    const thin = thinned(weeks('run', [[0, 36]]), 1, 2)
    const walked = earlier(thin, false)
    expect(walked).not.toBeNull()
    expect(earlier(thin, true)).toEqual(walked)
  })

  it('keeps the minimum of 4 efforts of the length in the window: 3 are too few, 4 are enough', () => {
    const base = weeks('run', [[0, 36]])
    const three = thinned(base, 1, 3)
    const four = thinned(base, 1, 4)
    const { period, selected } = splitPeriods(three, PERIOD_DAYS)
    // Enough in the period itself, so the shortfall is the window's.
    expect(selected.filter(reads).length).toBeGreaterThanOrEqual(8)
    expect(earlier(three)!.startMs).toBe(windowStart(period.startMs!, PERIOD_DAYS, 2))
    expect(earlier(four)).toBeNull()
  })

  it('keeps the minimum of 12 efforts in the two together: 4 and 4 are too few', () => {
    const base = weeks('run', [[0, 36]])
    const four = thinned(thinned(base, 1, 4), 0, 4)
    const { period } = splitPeriods(four, PERIOD_DAYS)
    expect(earlier(four)!.startMs).toBe(windowStart(period.startMs!, PERIOD_DAYS, 2))
    // The window the walk settles on holds 8 or more, so 4 and 8 reach 12.
    expect(readingsOfWindow(four, windowStart(period.startMs!, PERIOD_DAYS, 2))).toBeGreaterThan(7)
  })

  it('asks for every sport the period has efforts for, and takes the latest window that tests them all', () => {
    // Runs in every week; rides in the period itself and in weeks 0 to 10 only: two windows back tests both sports.
    const both = [
      ...weeks('run', [[0, 36]]),
      ...weeks(
        'ride',
        [
          [0, 10],
          [26, 36],
        ],
        2,
      ),
    ]
    const { period } = splitPeriods(both, PERIOD_DAYS)
    const found = earlier(both)
    expect(found!.startMs).toBe(windowStart(period.startMs!, PERIOD_DAYS, 2))
    for (const sport of SPORTS) {
      expect(verdictAt(found!.change, sport, HEADLINE_DURATION_S)).not.toBe('untested')
    }
  })

  it('stays with the period before when no window tests more sports than it does', () => {
    // The ride is in the period only: every window tests the run and none the ride.
    const onlyRun = [...weeks('run', [[0, 36]]), ...weeks('ride', [[26, 36]], 2)]
    expect(earlier(onlyRun)).toBeNull()
  })

  it('is null when the history starts inside the period, so no window lies before it', () => {
    expect(
      earlierComparison(weeks('run', [[30, 36]]), inputOf(weeks('run', [[30, 36]]), false)),
    ).toBeNull()
  })

  it('compares with the windows’ own efforts: the test it returns is the one changeEvidence makes for that window', () => {
    const { period, selected } = splitPeriods(gap, PERIOD_DAYS)
    const found = earlier(gap)!
    const window = gap.filter((d) => d.startMs >= found.startMs && d.startMs <= found.endMs)
    expect(found.change).toEqual(
      changeEvidence(selected, window, SETTINGS, DEFAULT_BIKE_MODEL, null, EVERY_EFFORT),
    )
    expect(period.days).toBe(PERIOD_DAYS)
  })
})

describe('a library that fails the hard-effort check', () => {
  // Every session's peak heart rate is 70% of the reference, so the rule counts none of them as hard.
  const REFERENCE = {
    referenceHr: { run: 200, ride: 200 },
    reading: { run: 'trusted' as const, ride: 'trusted' as const },
    source: { run: 'data' as const, ride: 'data' as const },
    from: { run: null, ride: null },
  }
  const rule = hardEffortRule(REFERENCE, [])
  const easy = effortLibrary({
    sport: 'run',
    perWeek: 3,
    weeks: 36,
    seed: 4,
    peakHeartRate: { hard: 140, easy: 140 },
  })
  const without = (library: ActivityDigest[], from: number, to: number) =>
    library.filter((digest) => weekOf(digest) < from || weekOf(digest) >= to)
  const inputWith = (library: ActivityDigest[]): EarlierInput => {
    const { period, selected, previous } = splitPeriods(library, PERIOD_DAYS)
    return {
      ...inputOf(library, false),
      rule,
      immediate:
        previous.length === 0
          ? null
          : changeEvidence(selected, previous, SETTINGS, DEFAULT_BIKE_MODEL, null, rule.rule),
      period: { startMs: period.startMs!, endMs: period.endMs!, days: PERIOD_DAYS },
    }
  }

  it('is tested from every effort, so the period before is enough and no window is sought', () => {
    const { selected, previous } = splitPeriods(easy, PERIOD_DAYS)
    const call = callAt(
      changeEvidence(selected, previous, SETTINGS, DEFAULT_BIKE_MODEL, null, rule.rule),
      'run',
      HEADLINE_DURATION_S,
    )!
    expect(call.gated).toBe(false)
    expect(call.verdict).not.toBe('untested')
    expect(earlierComparison(easy, inputWith(easy))).toBeNull()
  })

  it('finds the window that holds enough efforts, whether or not any of them was hard', () => {
    const gap = without(easy, 10, 26)
    const found = earlierComparison(gap, inputWith(gap))
    expect(found).not.toBeNull()
    const call = callAt(found!.change, 'run', HEADLINE_DURATION_S)!
    expect(call.gated).toBe(false)
    expect(call.verdict).not.toBe('untested')
  })
})

/** How many activities of the window starting at `startMs` read at the headline length. */
function readingsOfWindow(library: ActivityDigest[], startMs: number): number {
  const window = library.filter(
    (d) => d.startMs >= startMs && d.startMs < startMs + PERIOD_DAYS * DAY_MS,
  )
  return window.filter(reads).length
}

describe('canTest', () => {
  it('is the test’s own answer: it holds exactly where the call at the length is not untested', () => {
    const readers = weeks('run', [[0, 36]]).filter(reads)
    const [early, late] = [
      readers.filter((d) => weekOf(d) < 18),
      readers.filter((d) => weekOf(d) >= 18),
    ]
    const read = (digests: ActivityDigest[]) =>
      readingsOf(digests, SETTINGS, DEFAULT_BIKE_MODEL, null, EVERY_EFFORT, HEADLINE_DURATION_S)
    for (const now of [3, 4, 6, 8, 12]) {
      for (const before of [3, 4, 8, 12]) {
        const [selected, previous] = [late.slice(0, now), early.slice(0, before)]
        expect(selected.length).toBe(now)
        expect(previous.length).toBe(before)
        const evidence = changeEvidence(selected, previous, SETTINGS, DEFAULT_BIKE_MODEL, null)
        const tested = verdictAt(evidence, 'run', HEADLINE_DURATION_S) !== 'untested'
        const [a, b] = [read(selected).run[HEAD]!, read(previous).run[HEAD]!]
        expect(canTest('run', a, b), `${now} against ${before}`).toBe(tested)
        // The minimums: 4 on each side and 12 together.
        expect(tested).toBe(now >= 4 && before >= 4 && now + before >= 12)
      }
    }
  })
})

describe('a session over a library with a gap', () => {
  const gap = weeks('run', [
    [0, 10],
    [26, 36],
  ])
  const session = new AnalysisSession()
  session.loadDigests(gap, SETTINGS)
  const state = session.setRange(PERIOD_DAYS, SETTINGS)

  it('keeps the previous period and its test as they were, and adds the window beside them', () => {
    expect(state.previous).toBeNull()
    expect(state.change).toBeNull()
    expect(state.earlier).not.toBeNull()
    expect(verdictAt(state.earlier!.change, 'run', HEADLINE_DURATION_S)).not.toBe('untested')
  })

  it('has none under all time, which has no period before, or when the period before holds enough', () => {
    expect(session.setRange('all', SETTINGS).earlier).toBeNull()
    const dense = new AnalysisSession()
    dense.loadDigests(weeks('run', [[0, 36]]), SETTINGS)
    expect(dense.setRange(PERIOD_DAYS, SETTINGS).earlier).toBeNull()
  })
})
