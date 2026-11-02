import { expect, it, vi } from 'vitest'

const replays = vi.hoisted(() => ({ count: 0 }))
vi.mock('../fitness/machine', async (importOriginal) => {
  const real = await importOriginal<typeof import('../fitness/machine')>()
  return {
    ...real,
    replay: (...args: Parameters<typeof real.replay>) => {
      replays.count++
      return real.replay(...args)
    },
  }
})

import { plantedLibrary } from '../findings/test/plantedLibrary'
import { AnalysisSession } from '../session'

it('reads the runs the card and the look-back read, so the session replays each sport once for all three', () => {
  const library = plantedLibrary({
    seed: 9,
    weeks: 120,
    perWeek: 4,
    sports: ['run', 'ride'],
    noise: 0.03,
    effects: [],
  })
  const state = new AnalysisSession().loadDigests(library.digests, { massKg: 70, bikeMassKg: 9 })
  expect(state.history.fitness.run.levels.length).toBe(state.fitness.run.steady)
  expect(state.history.fitness.ride.levels.length).toBe(state.fitness.ride.steady)
  // One replay for the run and one for the ride, the card's: the chart's dots and spans come from its memory.
  expect(replays.count).toBe(2)
})
