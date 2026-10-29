import { describe, expect, it } from 'vitest'
import { fastestMs } from '../test/timing'
import { evaluate } from './evaluate'
import { inputAt, weeklyMarks } from './input'
import { registryOf } from './registry'
import { replay } from './replay'
import { plantedLibrary } from './test/plantedLibrary'
import { stubCandidate, stubDetector } from './test/stubs'

/**
 * An evaluation of a 2,000-activity library with every shared table worked out: the same-heart-rate
 * fits are most of it, and are capped by the weeks reported, not by the library. It took about 100 ms
 * when this was written. The budget leaves room for a loaded runner; work that grows with the library
 * in a table, or a detector run for no reason, fails it. Detectors add their own budgets.
 */
const EVALUATE_BUDGET_MS = 400

/**
 * A replay of the last 12 weekly marks, which is what recovers the first-seen dates and the
 * two-in-a-row gate: twelve evaluations, each with its own tables, about 1.0 s when this was written.
 */
const REPLAY_BUDGET_MS = 5000
const REPLAY_MARKS = 12

/** 250 weeks of 8 activities, run and ride alternating: 2,000 activities, 1,000 of each sport. */
const library = plantedLibrary({
  seed: 1,
  weeks: 250,
  perWeek: 8,
  noise: 0.02,
  sports: ['run', 'ride'],
  effects: [],
})

/** A detector that reads every table, as the heaviest would, and says one thing. */
const readsEverything = stubDetector('reads-everything', {
  sports: ['run', 'ride'],
  says: (input, sport) => {
    const { sameHeartRate, weeklyMoving, coverage, sourceChanges, drift, durability } = input.tables
    const seen =
      sameHeartRate[sport].weeks.length +
      weeklyMoving[sport].length +
      coverage[sport].length +
      sourceChanges[sport].length +
      drift[sport].length
    return [
      stubCandidate(
        { numbers: [{ key: 'seen', value: seen + durability[sport].length, unit: '' }] },
        input,
      ),
    ]
  },
})

describe('evaluation performance', () => {
  it(`evaluates 2,000 activities with all the tables in under ${EVALUATE_BUDGET_MS} ms`, () => {
    expect(library.digests).toHaveLength(2000)
    const registry = registryOf([readsEverything])
    let found = 0
    const ms = fastestMs(() => {
      found = evaluate(inputAt(library), { registry }).length
    })
    expect(found).toBe(1)
    expect(ms).toBeLessThan(EVALUATE_BUDGET_MS)
  })

  it(`replays the last ${REPLAY_MARKS} weekly marks of the same library in under ${REPLAY_BUDGET_MS} ms`, () => {
    const registry = registryOf([readsEverything])
    const marks = weeklyMarks(library.digests).slice(-REPLAY_MARKS)
    let spoken = 0
    const ms = fastestMs(() => {
      spoken = replay(library, marks, { registry }).marks.at(-1)!.spoken.length
    }, 3)
    expect(marks).toHaveLength(REPLAY_MARKS)
    expect(spoken).toBe(1)
    expect(ms).toBeLessThan(REPLAY_BUDGET_MS)
  })
})
