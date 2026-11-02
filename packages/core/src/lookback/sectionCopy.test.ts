import { describe, expect, it } from 'vitest'
import type { SportLookBack } from './compute'
import { breakRow, episodeRow, quietRow, thinRow, tooShortText } from './copy'
import { episodeFinding, yearsFinding } from './sectionCopy'
import type { EffortMilestones, HindsightEpisode, HindsightFitness } from './types'

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
    expect(yearsFinding(run)).toBe('Improved in 2023')
    expect(episodeFinding(episode({}), run)).toBe('Slipped in 2021, then came back')
    expect(episodeFinding(episode({ kind: 'slip-partly-back' }), run)).toBe(
      'Slipped in 2021, then came part of the way back',
    )
    expect(episodeFinding(episode({ kind: 'slip-open' }), run)).toBe(
      'Slipped in 2021, stayed lower until it fell again',
    )
    expect(
      episodeFinding(
        episode({ kind: 'after-break', change: { value: 0.08, low: 0.05, high: 0.1 } }),
        run,
      ),
    ).toBe('Pace was faster after the break in 2021')
  })

  it('says a ride in power, and an open slip only as the year it began', () => {
    const ride = block('ride', years({ episodes: [episode({ kind: 'slip-open', toMs: null })] }))
    expect(yearsFinding(ride)).toBe('Slipped in 2021')
    const up = block(
      'ride',
      years({
        episodes: [episode({ kind: 'improvement', change: { value: 0.08, low: 0.06, high: 0.1 } })],
      }),
    )
    expect(yearsFinding(up)).toBe('Improved in 2021')
  })

  it('falls back to a quiet stretch, then to nothing, and says what a short library needs', () => {
    const quiet = block(
      'run',
      years({ quiet: [{ fromMs: T(2021, 6), toMs: T(2024, 7), within: 0.03, runs: 310 }] }),
    )
    expect(yearsFinding(quiet)).toBe('Pace stayed within 3% from June 2021 to July 2024')
    // A statement that a level stayed within a range waits for the card to allow it.
    expect(yearsFinding(quiet, 'slipping')).toBeNull()
    expect(yearsFinding(quiet, 'holding')).toMatch(/^Pace stayed within 3% from /)
    expect(yearsFinding(block('run', years({})))).toBeNull()
    expect(yearsFinding(block('run', { kind: 'unavailable' }))).toBeNull()
    // A sport too short for its years has no finding: its section says what it needs.
    expect(
      yearsFinding(
        block('run', { kind: 'too-short', steady: 20, weeks: 30, needSteady: 40, needWeeks: 52 }),
      ),
    ).toBeNull()
  })

  it('names a sport with only bests by that, not by a best that has stood', () => {
    const best: EffortMilestones = {
      effort: { kind: 'duration', durationS: 300 },
      unit: 'W',
      best: { value: 300, atMs: T(2019, 4), id: 'a' },
      years: [],
      omittedYears: 0,
      steps: [],
      verdicts: [],
    }
    const ride = { ...block('ride', years({})), milestones: [best] }
    expect(yearsFinding(ride)).toBe('Best efforts by year')
  })

  it('says rides where a ride is meant: steady riding, steady rides', () => {
    const short = {
      kind: 'too-short',
      steady: 20,
      weeks: 30,
      needSteady: 40,
      needWeeks: 52,
    } as const
    expect(yearsFinding(block('ride', short))).toBeNull()
    expect(tooShortText(short, 'ride')).toBe(
      'Needs 40 steady rides over 52 weeks. You have 20 over 30.',
    )
    expect(thinRow({ fromMs: T(2021, 1), toMs: T(2021, 5) }, 'ride')).toBe(
      'No steady rides from January to May 2021.',
    )
    expect(breakRow({ fromMs: T(2021, 1), toMs: T(2021, 5) }, 'ride')).toBe(
      'No rides from January to May 2021.',
    )
    const ride = block(
      'ride',
      years({
        episodes: [episode({})],
        quiet: [{ fromMs: T(2022, 1), toMs: T(2023, 1), within: 0.03, runs: 90 }],
      }),
    )
    expect(episodeRow(episode({}), ride, ride.fitness as HindsightFitness)).toMatch(
      /60 steady rides\.$/,
    )
    expect(
      quietRow({ fromMs: T(2022, 1), toMs: T(2023, 1), within: 0.03, runs: 90 }, 'ride'),
    ).toMatch(/90 steady rides\.$/)
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
