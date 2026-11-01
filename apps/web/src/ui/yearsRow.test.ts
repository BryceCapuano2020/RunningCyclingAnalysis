import { describe, expect, it } from 'vitest'
import { NO_FITNESS } from '@rca/core/fitness/types'
import { NO_LOOKBACK } from '@rca/core/lookback'
import type { EffortMilestones } from '@rca/core/lookback'
import { firstRowOf } from './checkInRow'
import { yearsWords } from './yearsRow'
import { QUIET_CHECK_IN } from './checkInFixtures'
import { RUN_YEARS, YEARS_LOOKBACK } from './yearsFixtures'

const none = { checkIn: null, seen: false } as const

describe('what "Your years" says', () => {
  it('leads with the slip that came back, dated, and keeps the slip still open out of the list', () => {
    const words = yearsWords(YEARS_LOOKBACK, NO_FITNESS, 'metric')!
    expect(words.lead).toBe(
      'From May 2021 your pace at 148 bpm was about 8.7% (6 to 11%) slower. By January 2022 it was back.',
    )
    // The lead is not listed again; the other episode is, and not as an open-ended claim about now.
    expect(words.rows).toEqual([])
  })

  it('never leads with a best that has stood: a library whose only lead is a best has no row', () => {
    const best: EffortMilestones = {
      effort: { kind: 'duration', durationS: 300 },
      unit: 'm/s',
      best: { value: 4.2, atMs: Date.UTC(2018, 3, 1), id: 'a' },
      years: [],
      omittedYears: 0,
      steps: [],
      verdicts: [],
    }
    const bestOnly = {
      ...YEARS_LOOKBACK,
      sports: {
        ...YEARS_LOOKBACK.sports,
        run: {
          ...YEARS_LOOKBACK.sports.run,
          fitness: { ...RUN_YEARS, episodes: [], quiet: [] },
          milestones: [best],
        },
      },
    }
    expect(yearsWords(bestOnly, NO_FITNESS, 'metric')).toBeNull()
  })

  it('does not list an episode still open at the horizon: the card tells it', () => {
    const words = yearsWords(YEARS_LOOKBACK, NO_FITNESS, 'metric')!
    expect(words.rows.join(' ')).not.toMatch(/still lower/)
    expect(words.rows).toEqual([])
  })

  it('has nothing for a library with no years to tell', () => {
    expect(yearsWords(NO_LOOKBACK, NO_FITNESS, 'metric')).toBeNull()
  })

  it('says nothing the card contradicts: no quiet stretch while a slip shows on the card', () => {
    const quietOnly = {
      ...YEARS_LOOKBACK,
      sports: {
        ...YEARS_LOOKBACK.sports,
        run: {
          ...YEARS_LOOKBACK.sports.run,
          fitness: { ...YEARS_LOOKBACK.sports.run.fitness, episodes: [] } as never,
        },
      },
    }
    const holding = { ...NO_FITNESS, run: { ...NO_FITNESS.run, state: 'slipping' as const } }
    expect(yearsWords(quietOnly, holding, 'metric')?.lead ?? '').not.toMatch(/stayed within/)
  })
})

describe('which row sits under the fitness card', () => {
  const base = { importIncomplete: false, isSample: false }
  it('is the check-in first, then the years, each until it is seen', () => {
    const unseen = { checkIn: QUIET_CHECK_IN, seen: false }
    expect(firstRowOf({ ...base, checkIn: unseen, hasYears: true })).toBe('checkIn')
    expect(firstRowOf({ ...base, checkIn: { ...unseen, seen: true }, hasYears: true })).toBe(
      'lookBack',
    )
    expect(firstRowOf({ ...base, checkIn: none, hasYears: true })).toBe('lookBack')
    expect(
      firstRowOf({ ...base, checkIn: { ...none, lookBackSeen: true }, hasYears: true }),
    ).toBeNull()
    expect(firstRowOf({ ...base, checkIn: none, hasYears: false })).toBeNull()
  })

  it('is none while an import is partial and for the sample', () => {
    expect(
      firstRowOf({ checkIn: none, hasYears: true, importIncomplete: true, isSample: false }),
    ).toBeNull()
    expect(
      firstRowOf({ checkIn: none, hasYears: true, importIncomplete: false, isSample: true }),
    ).toBeNull()
  })
})
