import { describe, expect, it } from 'vitest'
import { lintCopy } from '../findings/copy'
import { fitnessFindingHeadline, fitnessLines, sized } from './copy'
import { noFitness } from './types'
import type { FitnessSpan, FitnessState, FitnessStatus, Ranged } from './types'
import type { Sport } from '../types'

const FEB = Date.UTC(2025, 1, 28)
const span = (runs: number, from: number, to: number): FitnessSpan => ({
  fromMs: from,
  toMs: to,
  runs,
  weeks: 8,
  ids: [],
})
const NOW = span(14, Date.UTC(2025, 3, 14), Date.UTC(2025, 5, 8))

/** A run's output is m/s (3.33 is 5:00 /km); a ride's is watts. */
const FIGURES: Record<Sport, { now: number; before: number }> = {
  run: { now: 1000 / 330, before: 1000 / 300 },
  ride: { now: 172, before: 183 },
}
/** The change in output, as a fraction, with its 90% range: a run from 5:00 to 5:30 /km is 9.1% less speed. */
const LOSS: Ranged = { value: -0.0909, low: -0.13, high: -0.05 }
const GAIN: Ranged = { value: 0.1, low: 0.04, high: 0.16 }

function status(
  sport: Sport,
  state: FitnessState,
  over: Partial<FitnessStatus> = {},
): FitnessStatus {
  return {
    ...noFitness(sport),
    state,
    referenceHr: 150,
    ...FIGURES[sport],
    change: LOSS,
    gain: { value: 0.05, low: 0.03, high: 0.07 },
    within: 0.04,
    onsetMs: FEB,
    lowMs: Date.UTC(2025, 6, 10),
    evidence: {
      recent: NOW,
      baseline: { fromMs: 0, toMs: 0, runs: 22, weeks: 20 },
      method: {
        tier: 'steady-pace',
        gradePassThrough: 0.3,
        speedPerBpm: 0.004,
        fitted: 900,
        seasonal: null,
      },
    },
    shortfall: null,
    steady: 100,
    asOfMs: Date.UTC(2025, 9, 25),
    ...over,
  }
}

const STATES: FitnessState[] = [
  'slipping',
  'holding',
  'holding-below',
  'recovering',
  'back',
  'improving',
  'improved',
]

describe('the lines of a status', () => {
  it('says a slip in pace terms, with its range, the level before and the day it began', () => {
    const lines = fitnessLines(status('run', 'slipping'), 'metric')
    // 5:00 to 5:30 is 10% slower in pace, though speed fell by 9.1%; the range is mapped the same way.
    expect(lines.headline).toBe(
      'At 150 bpm you now run 5:30 /km, 10% (5 to 15%) slower than the 5:00 /km before 28 Feb.',
    )
    expect(lines.support).toBe(
      '14 steady runs, 14 Apr to 8 Jun, against 22 in the 32 weeks before 28 Feb.',
    )
  })

  it('writes pace per mile when the athlete counts in miles', () => {
    const lines = fitnessLines(status('run', 'slipping'), 'imperial')
    expect(lines.headline).toContain('/mi')
    expect(lines.headline).not.toContain('/km')
    expect(lines.headline).toMatch(/slower than the 8:\d\d \/mi before 28 Feb/)
  })

  it('says rides in watts and in power terms', () => {
    const lines = fitnessLines(
      status('ride', 'slipping', {
        referenceHr: 140,
        change: { value: -0.06, low: -0.09, high: -0.03 },
      }),
      'imperial',
    )
    expect(lines.headline).toBe(
      'At 140 bpm you now ride at 172 W, 6% (3 to 9%) less than the 183 W before 28 Feb.',
    )
  })

  it('says holding with how far from level the runs allow, a distance and never under the floor of the range', () => {
    const lines = fitnessLines(
      status('run', 'holding', { change: { value: 0.002, low: -0.03, high: 0.03 }, within: 0.045 }),
      'metric',
    )
    expect(lines.headline).toBe(
      'At 150 bpm you run 5:30 /km, level with the 36 weeks before (within 4.6%).',
    )
  })

  it('says holding below, recovering with "still", and recovering above the old level without it', () => {
    expect(fitnessLines(status('run', 'holding-below'), 'metric').headline).toContain(
      'holding 10% (5 to 15%) slower than the 5:00 /km before 28 Feb',
    )
    const recovering = fitnessLines(status('run', 'recovering'), 'metric').headline
    expect(recovering).toContain('regained 4.8% (3 to 7%) since your low in July')
    expect(recovering).toContain('still 10% (5 to 15%) slower')
    const above = fitnessLines(status('run', 'recovering', { change: GAIN }), 'metric').headline
    expect(above).toContain(', now 9.1% (4 to 14%) faster than the')
    expect(above).not.toContain('still')
  })

  it('says back within a tolerance, and back and faster when the whole range is above the old level', () => {
    const level = status('run', 'back', {
      change: { value: 0.004, low: -0.02, high: 0.03 },
      within: 0.034,
    })
    expect(fitnessLines(level, 'metric').headline).toBe(
      'At 150 bpm you are back: 5:30 /km against 5:00 /km before 28 Feb, within 3.5%.',
    )
    const faster = fitnessLines(status('run', 'back', { change: GAIN }), 'metric').headline
    expect(faster).toBe(
      'At 150 bpm you are back and faster: 5:30 /km against 5:00 /km before 28 Feb, 9.1% (4 to 14%) faster.',
    )
    expect(faster).not.toContain('within')
  })

  it('says a rise as a rise, dated, and a settled one as holding at the new level', () => {
    const rising = fitnessLines(status('run', 'improving', { change: GAIN }), 'metric')
    expect(rising.headline).toBe(
      'At 150 bpm you now run 5:30 /km, 9.1% (4 to 14%) faster than the 5:00 /km before 28 Feb.',
    )
    const settled = fitnessLines(status('run', 'improved', { change: GAIN }), 'metric')
    expect(settled.headline).toBe(
      'At 150 bpm you run 5:30 /km, holding 9.1% (4 to 14%) faster than the 5:00 /km before 28 Feb.',
    )
    expect(fitnessFindingHeadline(status('run', 'improved', { change: GAIN }))).toBe(
      'At 150 bpm you now run 9.1% (4 to 14%) faster than before 28 Feb.',
    )
  })

  it('says level, not a direction, when the range of the change reaches both sides of level', () => {
    const across: Ranged = { value: 0.006, low: -0.03, high: 0.04 }
    const slipping = fitnessLines(
      status('run', 'slipping', { change: across, within: 0.045 }),
      'metric',
    )
    expect(slipping.headline).toBe(
      'At 150 bpm you now run 5:30 /km, level with the 5:00 /km before 28 Feb (within 4.6%).',
    )
    const below = fitnessLines(
      status('run', 'holding-below', { change: across, within: 0.045 }),
      'metric',
    )
    expect(below.headline).toContain('level with the 5:00 /km before 28 Feb (within 4.6%)')
    const recovering = fitnessLines(
      status('run', 'recovering', {
        change: across,
        within: 0.045,
        gain: { value: 0.01, low: -0.02, high: 0.04 },
      }),
      'metric',
    ).headline
    expect(recovering).toContain('regained ground since your low in July')
    expect(recovering).toContain('level with the 5:00 /km before 28 Feb (within 4.6%)')
    for (const text of [slipping.headline, below.headline, recovering]) {
      expect(text).not.toMatch(/slower|faster|still/)
    }
  })

  it('says "within" as a distance in the athlete\'s terms, the larger side, for a run and a ride', () => {
    const run = fitnessLines(status('run', 'holding', { within: 0.1 }), 'metric').headline
    const ride = fitnessLines(status('ride', 'holding', { within: 0.1 }), 'metric').headline
    // exp(0.1) - 1: a pace 10.5% slower is as far as a speed 9.5% faster, and the larger is said.
    expect(run).toContain('within 11%')
    expect(ride).toContain('within 11%')
  })

  it('passes the copy lint in every state, sport and unit', () => {
    for (const sport of ['run', 'ride'] as const) {
      for (const system of ['metric', 'imperial'] as const) {
        for (const state of STATES) {
          for (const change of [LOSS, GAIN]) {
            const lines = fitnessLines(status(sport, state, { change }), system)
            expect(lines.headline.length).toBeGreaterThan(0)
            expect([...lintCopy(lines.headline), ...lintCopy(lines.support)]).toEqual([])
          }
        }
      }
    }
  })
})

describe('the headline of a finding', () => {
  it('carries sizes and dates but no pace or power, which the unit setting would change', () => {
    expect(fitnessFindingHeadline(status('run', 'slipping'))).toBe(
      'At 150 bpm you now run 10% (5 to 15%) slower than before 28 Feb.',
    )
    expect(
      fitnessFindingHeadline(
        status('ride', 'slipping', { change: { value: -0.06, low: -0.09, high: -0.03 } }),
      ),
    ).toBe('At 150 bpm you now ride at 6% (3 to 9%) less power than before 28 Feb.')
    expect(fitnessFindingHeadline(status('run', 'recovering'))).toBe(
      'At 150 bpm you have regained 4.8% (3 to 7%) since your low in July.',
    )
    expect(
      fitnessFindingHeadline(
        status('run', 'back', { change: { value: 0.004, low: -0.02, high: 0.03 }, within: 0.034 }),
      ),
    ).toBe('At 150 bpm you are back to your level before 28 Feb, within 3.5%.')
    expect(fitnessFindingHeadline(status('run', 'back', { change: GAIN }))).toBe(
      'At 150 bpm you are back and 9.1% (4 to 14%) faster than before 28 Feb.',
    )
    for (const state of ['slipping', 'recovering', 'back'] as const) {
      expect(lintCopy(fitnessFindingHeadline(status('run', state)))).toEqual([])
    }
  })

  it('has none for the states that are status lines', () => {
    for (const state of ['holding', 'holding-below', 'improving'] as const) {
      expect(fitnessFindingHeadline(status('run', state))).toBe('')
    }
  })
})

describe('the year of a date', () => {
  it('is named when the change began or the low fell in an earlier year than the status is as of, in the sentence and the finding', () => {
    const later = status('run', 'recovering', { asOfMs: Date.UTC(2026, 3, 12) })
    const { headline } = fitnessLines(later, 'metric')
    expect(headline).toContain('since your low in July 2025')
    expect(headline).toContain('before 28 Feb 2025')
    expect(fitnessFindingHeadline(later)).toContain('since your low in July 2025')
    const slip = fitnessLines(
      status('run', 'slipping', { asOfMs: Date.UTC(2026, 3, 12) }),
      'metric',
    )
    expect(slip.headline).toMatch(/before 28 Feb 2025\.$/)
  })

  it('is left out in the status’s own year, so a recent date stays short', () => {
    const { headline } = fitnessLines(status('run', 'recovering'), 'metric')
    expect(headline).toContain('since your low in July:')
    expect(headline).toMatch(/before 28 Feb\.$/)
    expect(headline).not.toMatch(/2025/)
  })
})

describe('sized', () => {
  it('writes a one-sided range as sizes, the direction left to the words beside it', () => {
    expect(sized('ride', { value: 0.06, low: 0.03, high: 0.09 })).toBe('6% (3 to 9%)')
    expect(sized('ride', { value: -0.06, low: -0.09, high: -0.03 })).toBe('6% (3 to 9%)')
  })

  it('keeps the signs of a range that crosses level', () => {
    expect(sized('ride', { value: 0.004, low: -0.03, high: 0.04 })).toBe('0.4% (-3 to +4%)')
    expect(sized('ride', { value: -0.01, low: -0.05, high: 0.02 })).toBe('1% (-5 to +2%)')
  })
})
