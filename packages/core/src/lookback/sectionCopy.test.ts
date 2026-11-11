import { describe, expect, it } from 'vitest'
import type { SportLookBack } from './compute'
import { tooShortText } from './copy'
import { yearsFinding } from './sectionCopy'
import type { EffortMilestones, HindsightFitness } from './types'

const T = (year: number, month: number) => Date.UTC(year, month - 1, 1)
const years = (over: Partial<HindsightFitness>): HindsightFitness => ({
  kind: 'ok',
  fromMs: T(2020, 1),
  toMs: T(2024, 8),
  runs: 300,
  levels: [],
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
  it('is the quiet stretch, said in the sport own terms', () => {
    const quiet = [{ fromMs: T(2021, 6), toMs: T(2024, 7), within: 0.03, runs: 310 }]
    expect(yearsFinding(block('run', years({ quiet })))).toBe(
      'Pace stayed within 3% from June 2021 to July 2024',
    )
    expect(yearsFinding(block('ride', years({ quiet })))).toMatch(/^Power stayed within /)
  })

  it('waits for the card before it says a level stayed within a range, and has nothing without one', () => {
    const quiet = block(
      'run',
      years({ quiet: [{ fromMs: T(2021, 6), toMs: T(2024, 7), within: 0.03, runs: 310 }] }),
    )
    expect(yearsFinding(quiet, 'improving')).toBeNull()
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

  it('says rides where a ride is meant: steady rides', () => {
    expect(tooShortText('ride')).toBe('Not enough steady rides for a fitness history.')
  })

  it('uses none of the words the copy rules ban', () => {
    const run = block(
      'run',
      years({ quiet: [{ fromMs: T(2021, 6), toMs: T(2024, 7), within: 0.03, runs: 310 }] }),
    )
    expect(yearsFinding(run)).not.toMatch(
      /limiter|weak|strength|holding you back|ahead of|because|caused|grade|slip|—/i,
    )
  })
})
