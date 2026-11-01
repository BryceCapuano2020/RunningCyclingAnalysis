import { DAY_MS, HALF_MARATHON_M } from '@rca/core/constants'
import { NO_HEART_RATE_JUDGEMENT } from '@rca/core/digest/setAsideTypes'
import type { HeartRateJudgement } from '@rca/core/digest/setAsideTypes'
import { NO_EFFORT_REFERENCE } from '@rca/core/effort'
import type { ActivitySummary } from '@rca/core/pipeline'
import { METRES_PER_MILE } from '@rca/core/units'
import { describe, expect, it } from 'vitest'
import { makeActivity, makeResult } from './components/fixtures'
import { gate, UNKNOWN } from './effortGateFixtures'
import { raceAnswerOf } from './raceAnswer'
import type { RacePast, RaceReach } from './raceAnswer'
import { forecastOf } from './test/raceForecast'

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
const judged = (hardIds: string[]): HeartRateJudgement => ({
  ...NO_HEART_RATE_JUDGEMENT,
  effortReference: {
    ...NO_EFFORT_REFERENCE,
    referenceHr: { run: 190, ride: null },
    reading: { run: 'trusted', ride: null },
  },
  sessions: { run: { hard: hardIds, endurance: [] }, ride: { hard: [], endurance: [] } },
  referenceHr: { run: 190, ride: null },
  setAside: [],
  fit: { run: null, ride: null },
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
  const reach: RaceReach = { judgement: judged(hardIds), library, endMs: END }
  return raceAnswerOf('run', result, 84, reach)
}

/** The answer as one of past runs. */
function past(answered: ReturnType<typeof answer>): RacePast {
  if (answered?.kind !== 'past') throw new Error(`expected past runs, got ${answered?.kind}`)
  return answered
}

describe('raceAnswerOf', () => {
  it('answers from the period when it holds a hard run', () => {
    const hard = run('hard', 20, true)
    const found = forecastOf(
      answer([hard], [hard, run('old-hard', 200, true, 40)], ['hard', 'old-hard']),
    )
    expect([found.window, found.kind]).toEqual(['period', 'predicted'])
    expect(found.basis?.startMs).toBe(hard.startMs)
  })

  it('goes to the last 12 months when the period holds only an easy run, and rests on the hard run there', () => {
    const easy = run('easy', 10, false)
    const hard = run('hard', 150, true, 46)
    const found = forecastOf(answer([easy], [easy, hard], ['hard']))
    expect([found.window, found.kind]).toEqual(['year', 'predicted'])
    expect(found.basis).toEqual({ distanceM: 10_000, startMs: hard.startMs })
    // The 10 km was run in 46:00 in that window and is held there.
    expect(found.found.races.find((race) => race.distanceM === 10_000)!.seconds).toBeCloseTo(
      46 * 60,
      6,
    )
  })

  it('answers from the period with a bound when no window holds a hard run', () => {
    const easy = run('easy', 10, false)
    const older = run('older', 400, false, 40)
    const found = forecastOf(answer([easy], [easy, older], []))
    expect([found.window, found.kind]).toEqual(['period', 'bound'])
    expect(found.basis?.startMs).toBe(easy.startMs)
    expect(found.found.races.find((race) => race.distanceM === 10_000)!.seconds).toBe(44 * 60)
  })

  it('answers with a bound from the 12 months when the period holds no run of a mile', () => {
    const inYear = run('year', 100, false)
    expect(answer([], [inYear], [])).toMatchObject({ window: 'year', kind: 'bound' })
  })

  it('keeps a run without a heart rate as a prediction, as it always was', () => {
    const bare = makeActivity({
      ...run('bare', 100, false),
      hasHeartRate: false,
      maxHeartRate: null,
    })
    expect(answer([], [bare], [])).toMatchObject({ window: 'year', kind: 'predicted' })
  })
})

describe('raceAnswerOf, where every run is older than 12 months before the period ends', () => {
  it('tells a hard run that old as it was run, with no forecast from it', () => {
    const old = run('old', 900, true, 41)
    const found = past(answer([], [old], ['old']))
    expect(found.ran).toEqual([{ distanceM: 10_000, seconds: 41 * 60, startMs: old.startMs }])
    expect(Object.keys(found).sort()).toEqual(['kind', 'ran'])
  })

  it('does the same for an easy run that old', () => {
    const old = run('old', 700, false)
    expect(past(answer([], [old], [])).ran).toHaveLength(1)
  })

  it('answers from a recent easy run before an old hard one: the recent bound, not the past', () => {
    const easy = run('easy', 10, false)
    const old = run('old', 900, true, 41)
    const found = forecastOf(answer([easy], [easy, old], ['old']))
    expect([found.window, found.kind]).toEqual(['period', 'bound'])
  })

  it('names each race distance at its fastest, in race order, and none that was not run', () => {
    const tenOld = run('ten-old', 800, true, 45)
    const tenNew = run('ten-new', 600, true, 42)
    const half = makeActivity({
      ...run('half', 700, false),
      distanceBests: [{ distanceM: HALF_MARATHON_M, seconds: 100 * 60 }],
    })
    const found = past(answer([], [tenOld, half, tenNew], ['ten-old', 'ten-new']))
    expect(found.ran.map((each) => [each.distanceM, each.seconds, each.startMs])).toEqual([
      [10_000, 42 * 60, tenNew.startMs],
      [HALF_MARATHON_M, 100 * 60, half.startMs],
    ])
  })

  it('names the run of the best VDOT when none of the race distances was run', () => {
    const mile = makeActivity({
      ...run('mile', 800, true),
      distanceBests: [
        { distanceM: METRES_PER_MILE, seconds: 400 },
        { distanceM: 3000, seconds: 700 },
      ],
    })
    const found = past(answer([], [mile], ['mile']))
    expect(found.ran).toHaveLength(1)
    expect(found.ran[0]!.startMs).toBe(mile.startMs)
  })

  it('does not count a treadmill run, or a best shorter than a mile, and finds none when that is all there is', () => {
    const treadmill = makeActivity({ ...run('belt', 100, true), indoor: true })
    const short = makeActivity({
      ...run('short', 100, true),
      distanceBests: [{ distanceM: 1000, seconds: 300 }],
    })
    expect(answer([], [treadmill, short], ['belt', 'short'])).toBeNull()
    expect(
      answer([], [makeActivity({ ...run('old-belt', 800, true), indoor: true })], []),
    ).toBeNull()
  })
})

describe('raceAnswerOf for a period of all time', () => {
  it('reads the period alone, whatever the age of its runs, and without the library’s judgement', () => {
    const easy = run('easy', 10, false)
    const hard = run('hard', 900, true)
    const result = makeResult({
      activities: [easy, hard],
      runMaxHeartRate: 190,
      effortGate: { run: gate({ sessions: { hard: ['hard'], endurance: [] } }), ride: UNKNOWN },
    })
    const reach = { judgement: judged(['hard']), library: [easy, hard], endMs: END }
    // The period is all time, so the best period in it answers, as it always did.
    expect(raceAnswerOf('run', result, null, reach)).toMatchObject({
      kind: 'predicted',
      window: 'period',
    })
    expect(raceAnswerOf('run', result, null)).toMatchObject({ kind: 'predicted' })
  })
})
