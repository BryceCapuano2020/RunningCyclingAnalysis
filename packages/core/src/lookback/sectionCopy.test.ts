import { describe, expect, it } from 'vitest'
import type { SportLookBack } from './compute'
import { episodeFinding, yearsFinding } from './sectionCopy'
import type { HindsightEpisode, HindsightFitness } from './types'

const T = (year: number, month: number) => Date.UTC(year, month - 1, 1)
const episode = (over: Partial<HindsightEpisode>): HindsightEpisode => ({
  kind: 'slip-back',
  fromMs: T(2021, 5),
  toMs: T(2022, 1),
  change: { value: -0.08, low: -0.1, high: -0.06 },
  regained: null,
  remaining: null,
  z: -6,
  steps: 1,
  runs: 60,
  ...over,
})
const years = (over: Partial<HindsightFitness>): HindsightFitness => ({
  kind: 'ok',
  fromMs: T(2020, 1),
  toMs: T(2024, 8),
  runs: 300,
  levels: [],
  episodes: [],
  omittedEpisodes: 0,
  quiet: [],
  thin: [],
  breaks: [],
  omittedSpans: 0,
  ...over,
})
const block = (sport: 'run' | 'ride', fitness: SportLookBack['fitness']): SportLookBack => ({
  sport,
  referenceHr: sport === 'run' ? 148 : 140,
  fitness,
  milestones: [],
})

describe("the finding a sport's years are named by", () => {
  it('is the latest episode that ended, said by its year and how it ended', () => {
    const run = block(
      'run',
      years({
        episodes: [
          episode({}),
          episode({
            kind: 'improvement',
            fromMs: T(2023, 2),
            toMs: T(2023, 9),
            change: { value: 0.07, low: 0.05, high: 0.09 },
          }),
          episode({ kind: 'slip-open', fromMs: T(2024, 3), toMs: null }),
        ],
      }),
    )
    expect(yearsFinding(run)).toBe('Your pace at 148 bpm got faster in 2023')
    expect(episodeFinding(episode({}), run)).toBe(
      'Your pace at 148 bpm slipped in 2021 and came back',
    )
    expect(episodeFinding(episode({ kind: 'slip-partly-back' }), run)).toBe(
      'Your pace at 148 bpm slipped in 2021 and came part of the way back',
    )
  })

  it('says a ride in power, and an open slip only as the year it began', () => {
    const ride = block('ride', years({ episodes: [episode({ kind: 'slip-open', toMs: null })] }))
    expect(yearsFinding(ride)).toBe('Your power at 140 bpm slipped in 2021')
    const up = block(
      'ride',
      years({
        episodes: [episode({ kind: 'improvement', change: { value: 0.08, low: 0.06, high: 0.1 } })],
      }),
    )
    expect(yearsFinding(up)).toBe('Your power at 140 bpm got higher in 2021')
  })

  it('falls back to a quiet stretch, then to nothing, and says what a short library needs', () => {
    const quiet = block(
      'run',
      years({ quiet: [{ fromMs: T(2021, 6), toMs: T(2024, 7), within: 0.03, runs: 310 }] }),
    )
    expect(yearsFinding(quiet)).toBe(
      'From June 2021 to July 2024 your pace at 148 bpm stayed within 3%',
    )
    expect(yearsFinding(block('run', years({})))).toBeNull()
    expect(yearsFinding(block('run', { kind: 'unavailable' }))).toBeNull()
    expect(
      yearsFinding(
        block('run', { kind: 'too-short', steady: 20, weeks: 30, needSteady: 40, needWeeks: 52 }),
      ),
    ).toBe('Your years start after a year of steady running')
  })

  it('uses none of the words the copy rules ban', () => {
    const run = block(
      'run',
      years({
        episodes: [
          episode({}),
          episode({ kind: 'after-break' }),
          episode({ kind: 'slip-open', toMs: T(2023, 1) }),
        ],
      }),
    )
    const all =
      run.fitness.kind === 'ok'
        ? run.fitness.episodes.map((e) => episodeFinding(e, run)).join(' ')
        : ''
    expect(all).not.toMatch(
      /limiter|weak|strength|holding you back|ahead of|because|caused|grade|—/i,
    )
  })
})
