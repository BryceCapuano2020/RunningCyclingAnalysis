import { describe, expect, it } from 'vitest'
import { fitnessStatusDetector } from '../findings/detectors/fitnessStatus'
import { replayDetector } from '../findings/test/harness'
import { plantedLibrary } from '../findings/test/plantedLibrary'
import { AnalysisSession } from '../session'
import { fastestMs } from '../test/timing'
import { fitnessStatuses } from './compute'

/**
 * What the fitness replay costs on a library of 2,000 activities, about five years of eight a week with
 * about 6 steady runs a week: the first time for a set of digests (reading every run's kilometres once, then the
 * weekly monitor over all the weeks), and again for the same digests, which only compares the list. Locally the
 * first takes about 30 ms with the readings already made and about 140 ms without (the season is refitted every 4
 * weeks, the learned floor reads 18 blocks a week); the budgets are about three times the dearer figure, so a pass
 * per week over every run, or a recomputed fit, fails them on a loaded runner.
 *
 * The findings engine replays the detector at every weekly mark, each a new set of digests, so the replay of four
 * years (210 marks) is 210 firsts. Each mark reads the kilometres once (kept per digest), fits and replays the monitor
 * with selection medians, about 30 ms on a loaded machine; the replay of 210 marks takes about 6.5 s (5.8 s before the
 * season, which a refit every 4 weeks keeps to about 15% more), and its budget is about twice that.
 */
const ACTIVITIES = 2000
const FIRST_BUDGET_MS = 400
const REPEAT_BUDGET_MS = 5
const REPLAY_BUDGET_MS = 13_000
const WEEK_MS = 7 * 86_400_000
const SETTINGS = { massKg: 75, bikeMassKg: 9 }
const NONE: ReadonlySet<string> = new Set()

describe('fitness on a large library', () => {
  const library = plantedLibrary({
    seed: 9,
    weeks: ACTIVITIES / 8,
    perWeek: 8,
    noise: 0.03,
    noiseModel: { autocorrelation: 0.9, heavyTails: true },
    effects: [{ type: 'efficiency-shift', atWeek: 150, size: -0.12 }],
  })

  it(`replays all of ${ACTIVITIES} activities in under ${FIRST_BUDGET_MS} ms, with their kilometres read`, () => {
    expect(library.digests).toHaveLength(ACTIVITIES)
    let steady = 0
    // `slice` makes a list the memory has not seen, so each timed call does the replay (the readings of a digest are kept).
    const ms = fastestMs(() => {
      steady = fitnessStatuses(library.digests.slice().reverse(), NONE).run.steady
    }, 5)
    expect(steady).toBeGreaterThan(1000)
    expect(ms).toBeLessThan(FIRST_BUDGET_MS)
  })

  it(`answers the same digests again in under ${REPEAT_BUDGET_MS} ms`, () => {
    const first = fitnessStatuses(library.digests, NONE)
    const ms = fastestMs(() => {
      expect(fitnessStatuses(library.digests, NONE)).toBe(first)
    }, 9)
    expect(ms).toBeLessThan(REPEAT_BUDGET_MS)
  })

  it('does not redo it when the period changes', () => {
    const session = new AnalysisSession()
    session.clock = () => library.lastMs
    session.choosePeriod('all')
    const all = session.loadDigests(library.digests, SETTINGS)
    expect(all.fitness.run.state).toBe('slipping')
    const ms = fastestMs(() => {
      expect(session.setRange(42, SETTINGS).fitness).toBe(all.fitness)
      expect(session.setRange('all', SETTINGS).fitness).toBe(all.fitness)
    }, 3)
    expect(ms).toBeLessThan(200)
  })

  it(`replays the engine over four years of weekly marks in under ${REPLAY_BUDGET_MS} ms`, () => {
    let marks = 0
    const ms = fastestMs(() => {
      marks = replayDetector(fitnessStatusDetector, library, {
        fromMs: library.firstMs + 40 * WEEK_MS,
      }).marks.length
    }, 1)
    expect(marks).toBeGreaterThanOrEqual(205)
    expect(ms).toBeLessThan(REPLAY_BUDGET_MS)
  })
})
