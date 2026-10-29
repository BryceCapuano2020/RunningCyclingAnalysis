import { describe, expect, it } from 'vitest'
import { lintCopy } from '../findings/copy'
import { fitnessFindingHeadline, fitnessLines } from './copy'
import { noFitness } from './types'
import type { FitnessSpan, FitnessState, FitnessStatus, Shortfall } from './types'
import type { Sport } from '../types'

const MAR = Date.UTC(2025, 2, 14)
const span = (runs: number, from: number, to: number): FitnessSpan => ({
  fromMs: from,
  toMs: to,
  runs,
  weeks: 8,
  ids: [],
})
const NOW = span(14, Date.UTC(2025, 3, 14), Date.UTC(2025, 5, 8))

/** A status with synthetic figures: 3.33 m/s is 5:00 /km, and 3.13 m/s is 5:19 /km. */
function status(
  sport: Sport,
  state: FitnessState,
  over: Partial<FitnessStatus> = {},
): FitnessStatus {
  const run = sport === 'run'
  return {
    ...noFitness(sport),
    state,
    referenceHr: 150,
    now: run ? 1000 / 319 : 172,
    before: run ? 1000 / 300 : 183,
    change: { value: -0.06, low: -0.09, high: -0.03 },
    gain: { value: 0.05, low: 0.03, high: 0.07 },
    within: 0.024,
    onsetMs: MAR,
    lowMs: Date.UTC(2025, 6, 10),
    evidence: {
      recent: NOW,
      baseline: span(22, 0, 0),
      method: { tier: 'steady-pace', gradePassThrough: 0.3, speedPerBpm: 0.004, fitted: 900 },
    },
    shortfall: null,
    steady: 100,
    ...over,
  }
}

const SPOKEN: FitnessState[] = ['slipping', 'holding', 'holding-below', 'recovering', 'back']

describe('the lines of a status', () => {
  it('says a slip with its range, the level before and the month it began', () => {
    const lines = fitnessLines(status('run', 'slipping'), 'metric')
    expect(lines.headline).toBe(
      'At 150 bpm you now run 5:19 /km, 6% (3 to 9%) slower than the 5:00 /km before March.',
    )
    expect(lines.support).toBe(
      '14 steady runs, 14 Apr to 8 Jun, against 22 in the 32 weeks before March.',
    )
  })

  it('writes pace per mile when the athlete counts in miles', () => {
    const lines = fitnessLines(status('run', 'slipping'), 'imperial')
    expect(lines.headline).toContain('/mi')
    expect(lines.headline).not.toContain('/km')
    expect(lines.headline).toMatch(/slower than the 8:\d\d \/mi before March/)
  })

  it('says rides in watts', () => {
    const lines = fitnessLines(status('ride', 'slipping', { referenceHr: 140 }), 'imperial')
    expect(lines.headline).toBe(
      'At 140 bpm you now ride at 172 W, 6% (3 to 9%) less than the 183 W before March.',
    )
  })

  it('says holding, recovering and back', () => {
    const holding = fitnessLines(
      status('run', 'holding', { change: { value: 0.002, low: -0.02, high: 0.02 } }),
      'metric',
    )
    expect(holding.headline).toMatch(
      /^At 150 bpm you run 5:19 \/km, level with the 36 weeks before \(within 2\.4%\)\.$/,
    )
    const below = fitnessLines(status('run', 'holding-below'), 'metric')
    expect(below.headline).toContain('holding 6% (3 to 9%) slower than the 5:00 /km before March')
    const recovering = fitnessLines(status('run', 'recovering'), 'metric')
    expect(recovering.headline).toContain('regained 5% (3 to 7%) since your low in July')
    expect(recovering.headline).toContain('still 6% (3 to 9%) slower')
    const back = fitnessLines(status('run', 'back', { within: 0.02 }), 'metric')
    expect(back.headline).toBe(
      'At 150 bpm you are back: 5:19 /km against 5:00 /km before March, within 2%.',
    )
  })

  it('says what is missing, with the counts', () => {
    const lacking = (shortfall: Shortfall, sport: Sport = 'run') =>
      fitnessLines({ ...noFitness(sport), shortfall }, 'metric').headline
    expect(lacking({ kind: 'history', have: 7, need: 12, weeks: 5, needWeeks: 8 })).toBe(
      'Not enough evidence yet. Pace at the same heart rate needs 12 steady runs over 8 different weeks before the last 8; there are 7.',
    )
    expect(lacking({ kind: 'recent', have: 2, need: 4, weeks: 8 })).toBe(
      'Not enough recent evidence yet. There are 2 steady runs in the last 8 weeks; 4 are needed.',
    )
    expect(lacking({ kind: 'recent', have: 1, need: 4, weeks: 8 })).toContain(
      'There is 1 steady run',
    )
    expect(lacking({ kind: 'break', weeksSince: 5 })).toBe(
      'Not enough recent evidence yet. The last steady run was 5 weeks ago.',
    )
    expect(lacking({ kind: 'imprecise', within: 0.09 })).toContain('within 9%')
    expect(
      lacking({ kind: 'history', have: 5, need: 12, weeks: 3, needWeeks: 8 }, 'ride'),
    ).toContain('Power at the same heart rate needs 12 steady rides')
    expect(lacking({ kind: 'unavailable' }, 'ride')).toContain('Rides are not compared')
  })

  it('passes the copy lint in every state, sport and unit', () => {
    for (const sport of ['run', 'ride'] as const) {
      for (const system of ['metric', 'imperial'] as const) {
        for (const state of SPOKEN) {
          const lines = fitnessLines(status(sport, state), system)
          expect(lines.headline.length).toBeGreaterThan(0)
          expect([...lintCopy(lines.headline), ...lintCopy(lines.support)]).toEqual([])
        }
      }
    }
  })
})

describe('the headline of a finding', () => {
  it('carries sizes and dates but no pace or power, which the unit setting would change', () => {
    const slip = fitnessFindingHeadline(status('run', 'slipping'))
    expect(slip).toBe('At 150 bpm you now run 6% (3 to 9%) slower than before March.')
    expect(fitnessFindingHeadline(status('ride', 'slipping'))).toBe(
      'At 150 bpm you now ride at 6% (3 to 9%) less power than before March.',
    )
    expect(fitnessFindingHeadline(status('run', 'recovering'))).toBe(
      'At 150 bpm you have regained 5% (3 to 7%) since your low in July.',
    )
    expect(fitnessFindingHeadline(status('run', 'back', { within: 0.02 }))).toBe(
      'At 150 bpm you are back to your level before March, within 2%.',
    )
    for (const state of ['slipping', 'recovering', 'back'] as const) {
      expect(lintCopy(fitnessFindingHeadline(status('run', state)))).toEqual([])
    }
  })
})
