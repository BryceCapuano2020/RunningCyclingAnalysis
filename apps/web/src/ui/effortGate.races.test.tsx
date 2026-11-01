// @vitest-environment jsdom
import { cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HALF_MARATHON_M } from '@rca/core/constants'
import type { EffortGate } from '@rca/core/effort'
import { makeActivity, makeResult } from './components/fixtures'
import { gate, UNKNOWN } from './effortGateFixtures'
import { raceAnswerOf } from './raceAnswer'
import { racePredictionNeed, racePredictionsOf } from './racePredictions'

afterEach(cleanup)

describe('race predictions and the effort gate', () => {
  const bests = [
    { distanceM: 5000, seconds: 21 * 60 },
    { distanceM: 10000, seconds: 44 * 60 },
  ]
  const run = (
    id: string,
    maxHeartRate: number | null,
    over: Parameters<typeof makeActivity>[0] = {},
  ) =>
    makeActivity({
      id,
      sport: 'run',
      distanceM: 10_000,
      distanceBests: bests,
      maxHeartRate,
      hasHeartRate: maxHeartRate !== null,
      ...over,
    })
  const result = (activities: ReturnType<typeof run>[], over: Partial<EffortGate> = {}) =>
    makeResult({
      activities,
      runMaxHeartRate: 190,
      effortGate: { run: gate({ sessions: sessions(activities), ...over }), ride: UNKNOWN },
    })
  /** The gate's hard sessions: the runs whose peak reached 90% of 190. */
  const sessions = (activities: ReturnType<typeof run>[]) => ({
    hard: activities.filter((a) => (a.maxHeartRate ?? 0) >= 171).map((a) => a.id),
    endurance: activities.filter((a) => a.id.startsWith('long')).map((a) => a.id),
  })

  it('carries the bests of a run that reached a hard heart rate to a race', () => {
    expect(racePredictionsOf('run', result([run('hard', 180)]))?.races.length).toBeGreaterThan(0)
  })

  it('does not carry the easy pace of a run whose peak heart rate was easy as a prediction', () => {
    expect(racePredictionsOf('run', result([run('easy', 140)]))).toBeNull()
  })

  it('answers from an easy run with a bound: every race is no slower than a time carried from it', () => {
    const answer = raceAnswerOf('run', result([run('easy', 140)]), null)!
    expect(answer.bound).toBe(true)
    expect(answer.window).toBe('period')
    expect(answer.found.races.map((race) => race.distanceM)).toEqual([
      5000, 10000, 21_097.5, 42_195,
    ])
    // The 10 km was run in 44:00 and is held there; the others are carried from the best of the two.
    expect(answer.found.races[1]!.seconds).toBe(44 * 60)
    expect(answer.basis).toEqual({ distanceM: 5000, startMs: run('easy', 140).startMs })
  })

  it('answers with a bound where the reference cannot show a run hard, however hard the run', () => {
    const habitual = result([run('a', 190)], {
      reference: 'habitual',
      neededS: null,
      sessions: { hard: [], endurance: [] },
    })
    expect(racePredictionsOf('run', habitual)).toBeNull()
    expect(raceAnswerOf('run', habitual, null)?.bound).toBe(true)
  })

  it('does not call a run hard because it is the only one: a hard run among easy ones sets the answer', () => {
    const answer = raceAnswerOf('run', result([run('easy', 140), run('hard', 180)]), null)!
    expect(answer.bound).toBe(false)
  })

  it('keeps the hard run’s bests among easy ones, and a run with no heart rate', () => {
    const mixed = racePredictionsOf('run', result([run('easy', 140), run('hard', 180)]))
    const hardOnly = racePredictionsOf('run', result([run('hard', 180)]))
    // The marathon also reads weekly volume, which counts every run; the shorter races read the bests alone.
    expect(mixed?.races.slice(0, 3)).toEqual(hardOnly?.races.slice(0, 3))
    expect(mixed?.runsVdot).toBe(hardOnly?.runsVdot)
    expect(racePredictionsOf('run', result([run('bare', null)]))).not.toBeNull()
  })

  it('carries a half marathon or longer from a run of high average heart rate, and a shorter best only from a hard one', () => {
    const halfBests = [
      { distanceM: 10000, seconds: 50 * 60 },
      { distanceM: HALF_MARATHON_M, seconds: 110 * 60 },
    ]
    const long = run('long-1', 150, { distanceBests: halfBests })
    const found = racePredictionsOf('run', result([long]))!
    // Only the half marathon is carried from it: the 10 km best of a run that never got hard is not.
    expect(found.races.some((race) => race.methods.some((m) => m.fromM === HALF_MARATHON_M))).toBe(
      true,
    )
    expect(found.races.some((race) => race.methods.some((m) => m.fromM === 10000))).toBe(false)
  })

  it('carries every run’s bests where the gate could not judge, as a prediction and not a bound', () => {
    const unchecked = result([run('easy', 140)], { verdict: 'unknown', unchecked: 'noHeartRate' })
    expect(racePredictionsOf('run', unchecked)).not.toBeNull()
    expect(raceAnswerOf('run', unchecked, null)?.bound).toBe(false)
  })

  it('asks only for a run of a mile or more, and only where the library holds none', () => {
    expect(racePredictionNeed('run')).toBe('Needs a run of a mile or more')
    expect(raceAnswerOf('run', result([]), null)).toBeNull()
    expect(raceAnswerOf('ride', result([run('easy', 140)]), null)).toBeNull()
  })
})
