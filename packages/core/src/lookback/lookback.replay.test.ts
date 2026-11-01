import '../test/warmSample'
import { describe, expect, it, vi } from 'vitest'
import { DAY_MS } from '../constants'
import { plantedLibrary } from '../findings/test/plantedLibrary'
import { fitnessStatuses } from '../fitness/compute'
import { replay } from '../fitness/machine'
import { AnalysisSession } from '../session'
import { NO_LOOKBACK, lookBackOf } from './compute'

// The replay is the dear step of a fitness status, so its calls are counted, not timed.
vi.mock('../fitness/machine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../fitness/machine')>()
  return { ...actual, replay: vi.fn(actual.replay) }
})

const SETTINGS = { massKg: 75, bikeMassKg: 9 }
const NONE: ReadonlySet<string> = new Set()
const replays = () => vi.mocked(replay).mock.calls.length

const library = (seed: number) =>
  plantedLibrary({ seed, weeks: 80, perWeek: 3, noise: 0.03, effects: [] })

describe('the look-back and the fitness card', () => {
  it('read one replay: the look-back does not replay the library again', () => {
    const { digests } = library(41)
    fitnessStatuses(digests, NONE)
    const card = replays()
    expect(card).toBeGreaterThan(0)
    lookBackOf(digests, SETTINGS, NONE)
    expect(replays()).toBe(card)
  })

  it('read one replay in a session whose clock is long after the newest activity, as a stored library is', () => {
    const { digests, lastMs } = library(42)
    const before = replays()
    const session = new AnalysisSession()
    session.clock = () => lastMs + 300 * DAY_MS
    const state = session.loadDigests(digests, SETTINGS)
    expect(state.lookBack).not.toBe(NO_LOOKBACK)
    // One sport, one replay, for the card and the look-back together.
    expect(replays() - before).toBe(1)
    // And both are as of the newest activity, not the clock.
    expect(state.lookBack.asOfMs).toBe(lastMs)
    expect(state.fitness.run.asOfMs).toBe(lastMs)
  })
})
