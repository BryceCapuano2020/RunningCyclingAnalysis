import { DAY_MS } from '@rca/core/constants'
import { NO_HEART_RATE_JUDGEMENT } from '@rca/core/digest/setAsideTypes'
import type { HeartRateJudgement } from '@rca/core/digest/setAsideTypes'
import { NO_EFFORT_REFERENCE } from '@rca/core/effort'
import type { ActivitySummary } from '@rca/core/pipeline'
import { describe, expect, it } from 'vitest'
import { makeActivity, makeResult } from './components/fixtures'
import { gate, UNKNOWN } from './effortGateFixtures'
import { raceAnswerOf } from './raceAnswer'
import type { RaceReach } from './raceAnswer'

/** The day the period ends, and the runs' days counted back from it. */
const END = Date.UTC(2026, 9, 30, 12)
const daysBack = (days: number) => END - days * DAY_MS

/** A run whose best 10 km is a given time; its heart rate peaks at a hard 180 or an easy 140 of a 190 reference. */
const run = (id: string, daysAgo: number, hard: boolean, tenKmMin = 44): ActivitySummary =>
  makeActivity({
    id,
    sport: 'run',
    startMs: daysBack(daysAgo),
    distanceM: 10_000,
    distanceBests: [{ distanceM: 10_000, seconds: tenKmMin * 60 }],
    maxHeartRate: hard ? 180 : 140,
    hasHeartRate: true,
  })

/** The library's judgement: a reference that can be trusted, with the library's hard runs among its sessions. */
const judged = (library: ActivitySummary[], hardIds: string[]): HeartRateJudgement => ({
  ...NO_HEART_RATE_JUDGEMENT,
  effortReference: {
    ...NO_EFFORT_REFERENCE,
    referenceHr: { run: 190, ride: null },
    reading: { run: 'trusted', ride: null },
  },
  sessions: { run: { hard: hardIds, endurance: [] }, ride: { hard: [], endurance: [] } },
  referenceHr: { run: 190, ride: null },
  setAside: [],
  // The library has the runs the sessions name, and nothing more is read of it.
  fit: { run: null, ride: null },
  ...(library.length === 0 ? {} : {}),
})

/** A period of 12 weeks holding `inPeriod`, within a library of `library` (which includes them). */
function answer(inPeriod: ActivitySummary[], library: ActivitySummary[], hardIds: string[]) {
  const result = makeResult({
    activities: inPeriod,
    runMaxHeartRate: 190,
    effortGate: {
      run: gate({
        sessions: {
          hard: hardIds.filter((id) => inPeriod.some((a) => a.id === id)),
          endurance: [],
        },
      }),
      ride: UNKNOWN,
    },
  })
  const reach: RaceReach = { judgement: judged(library, hardIds), library, endMs: END }
  return raceAnswerOf('run', result, 84, reach)
}

describe('raceAnswerOf', () => {
  it('answers from the period when it holds a hard run', () => {
    const hard = run('hard', 20, true)
    const found = answer([hard], [hard, run('old-hard', 200, true, 40)], ['hard', 'old-hard'])!
    expect([found.window, found.bound]).toEqual(['period', false])
    expect(found.basis?.startMs).toBe(hard.startMs)
  })

  it('goes to the last 12 months when the period holds only an easy run, and rests on the hard run there', () => {
    const easy = run('easy', 10, false)
    const hard = run('hard', 150, true, 46)
    const found = answer([easy], [easy, hard], ['hard'])!
    expect([found.window, found.bound]).toEqual(['year', false])
    expect(found.basis).toEqual({ distanceM: 10_000, startMs: hard.startMs })
    // The 10 km was run in 46:00 in that window and is held there.
    expect(found.found.races.find((race) => race.distanceM === 10_000)!.seconds).toBeCloseTo(
      46 * 60,
      6,
    )
  })

  it('goes to all time when the last 12 months holds no hard run', () => {
    const easy = run('easy', 10, false)
    const old = run('old', 900, true, 41)
    const found = answer([easy], [easy, old], ['old'])!
    expect([found.window, found.bound]).toEqual(['all', false])
    expect(found.basis?.startMs).toBe(old.startMs)
  })

  it('answers from the period with a bound when no window holds a hard run', () => {
    const easy = run('easy', 10, false)
    const older = run('older', 400, false, 40)
    const found = answer([easy], [easy, older], [])!
    expect([found.window, found.bound]).toEqual(['period', true])
    expect(found.basis?.startMs).toBe(easy.startMs)
    expect(found.found.races.find((race) => race.distanceM === 10_000)!.seconds).toBe(44 * 60)
  })

  it('answers with a bound from the 12 months, then all time, when the period holds no run of a mile', () => {
    const inYear = run('year', 100, false)
    expect(answer([], [inYear], [])).toMatchObject({ window: 'year', bound: true })
    const old = run('old', 700, false)
    expect(answer([], [old], [])).toMatchObject({ window: 'all', bound: true })
  })

  it('does not count a treadmill run, or a best shorter than a mile, and finds none when that is all there is', () => {
    const treadmill = makeActivity({ ...run('belt', 100, true), indoor: true })
    const short = makeActivity({
      ...run('short', 100, true),
      distanceBests: [{ distanceM: 1000, seconds: 300 }],
    })
    expect(answer([], [treadmill, short], ['belt', 'short'])).toBeNull()
  })

  it('reads the period alone for all time, and without the library’s judgement', () => {
    const easy = run('easy', 10, false)
    const hard = run('hard', 150, true)
    const result = makeResult({ activities: [easy], effortGate: { run: gate(), ride: UNKNOWN } })
    // An all-time period has no wider window, so a hard run it does not hold is no help; its easy run is the bound.
    expect(
      raceAnswerOf('run', result, null, {
        judgement: judged([easy, hard], ['hard']),
        library: [easy, hard],
        endMs: END,
      }),
    ).toMatchObject({ window: 'period', bound: true })
    expect(raceAnswerOf('run', result, 84)).toMatchObject({ window: 'period', bound: true })
  })

  it('keeps a run without a heart rate as a prediction, as it always was', () => {
    const bare = makeActivity({
      ...run('bare', 100, false),
      hasHeartRate: false,
      maxHeartRate: null,
    })
    expect(answer([], [bare], [])).toMatchObject({ window: 'year', bound: false })
  })
})
