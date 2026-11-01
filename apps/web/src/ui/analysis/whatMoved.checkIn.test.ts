import { describe, expect, it } from 'vitest'
import type { NewBest } from '@rca/core/lookback'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { AthleteSettings } from '@rca/core/types'
import { makeActivity, makeResult } from '../components/fixtures'
import type { ImportChange } from './importState'
import { listedMoves, whatMoved } from './whatMoved'

const SETTINGS: AthleteSettings = { massKg: 70, bikeMassKg: 9 }
const LATER = Date.UTC(2026, 0, 9, 7, 30)

const RUN = makeActivity({ id: 'run-1', sport: 'run' })
const NEW_RUN = makeActivity({ id: 'run-2', sport: 'run', startMs: LATER })
const SLOWER_1K = makeActivity({ ...RUN, distanceBests: [{ distanceM: 1000, seconds: 300 }] })
const FASTER_1K = makeActivity({
  ...NEW_RUN,
  distanceBests: [{ distanceM: 1000, seconds: 270 }],
})

const result = (overrides: Partial<AnalysisResult>): AnalysisResult =>
  makeResult({ runCp: { cp: 15.7, wPrime: 20, cpSe: 0.05, r2: 0.99, nPoints: 6 }, ...overrides })

const newBest = (overrides: Partial<NewBest>): NewBest => ({
  sport: 'run',
  effort: { kind: 'distance', distanceM: 5000 },
  unit: 's',
  value: 1500,
  previous: 1600,
  atMs: LATER,
  older: false,
  ...overrides,
})

describe('whatMoved: new bests are the check-in’s', () => {
  const before = result({ activities: [SLOWER_1K] })
  const after = result({ activities: [RUN, FASTER_1K] })

  it('names the 1 km best by the records rule where there is no check-in', () => {
    const items = whatMoved(before, after, SETTINGS, 'metric', null)
    expect(items.map((item) => item.text)).toEqual(['New best 1 km: 4:30'])
  })

  it('names no best the check-in does not list, so the two never disagree', () => {
    expect(whatMoved(before, after, SETTINGS, 'metric', null, true, null, {}, [])).toEqual([])
  })

  it('names a best the check-in lists even where the records rule found none', () => {
    const items = whatMoved(
      result({ activities: [RUN] }),
      result({ activities: [RUN, NEW_RUN] }),
      SETTINGS,
      'metric',
      null,
      true,
      null,
      {},
      [newBest({})],
    )
    expect(items.map((item) => item.text)).toEqual(['New best 5 km: 25 min'])
  })

  it('keeps the records’ wording and spoken form for a best both list', () => {
    const items = whatMoved(before, after, SETTINGS, 'metric', null, true, null, {}, [
      newBest({ effort: { kind: 'distance', distanceM: 1000 }, value: 270, previous: 300 }),
    ])
    expect(items).toEqual([
      { text: 'New best 1 km: 4:30', spoken: 'New best 1 km: 4 minutes 30 seconds' },
    ])
  })

  it('holds a ride best the check-in lists while no weight is entered', () => {
    const items = whatMoved(before, after, SETTINGS, 'metric', null, false, null, {}, [
      newBest({
        sport: 'ride',
        effort: { kind: 'duration', durationS: 1200 },
        unit: 'W',
        value: 250,
        previous: 240,
      }),
    ])
    expect(items).toEqual([])
  })
})

describe('listedMoves: the check-in kept with the import', () => {
  const outcome: ImportChange['outcome'] = {
    activities: 1,
    rejected: 0,
    duplicates: [],
    runs: 1,
    rides: 0,
    firstStartMs: LATER,
    lastStartMs: LATER,
  }
  const base = {
    outcome,
    before: result({ activities: [SLOWER_1K] }),
    after: result({ activities: [RUN, FASTER_1K] }),
  }

  it('lists no best when the check-in beside it lists none', () => {
    const texts = (change: ImportChange) =>
      listedMoves(change, SETTINGS, 'metric', null).map((item) => item.text)
    expect(texts({ ...base, bests: [] }).some((text) => text.startsWith('New best'))).toBe(false)
    expect(texts(base).some((text) => text.startsWith('New best 1 km'))).toBe(true)
  })
})
