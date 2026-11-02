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
  it('says a slip with the level first, then one line for the change with its range and the level before', () => {
    const lines = fitnessLines(status('run', 'slipping'), 'metric')
    expect(lines).toEqual({
      headline: '5:30 /km at 150 bpm.',
      // 5:00 to 5:30 is 10% slower in pace, though speed fell by 9.1%; the range is mapped the same way.
      changes: ['10% (5 to 15) off your level before 28 Feb.'],
      support: 'From 14 steady runs, 14 Apr to 8 Jun.',
      needs: '',
    })
  })

  it('writes pace per mile when the athlete counts in miles', () => {
    const lines = fitnessLines(status('run', 'slipping'), 'imperial')
    expect(lines.headline).toMatch(/^8:\d\d \/mi at 150 bpm\.$/)
    expect([lines.headline, ...lines.changes].join(' ')).not.toContain('/km')
  })

  it('says rides in watts and in power terms', () => {
    const slip = fitnessLines(
      status('ride', 'slipping', {
        referenceHr: 140,
        change: { value: -0.06, low: -0.09, high: -0.03 },
      }),
      'imperial',
    )
    expect(slip.headline).toBe('172 W at 140 bpm.')
    expect(slip.changes).toEqual(['6% (3 to 9) off your level before 28 Feb.'])
    const rise = fitnessLines(status('ride', 'improving', { change: GAIN }), 'imperial')
    expect(rise.changes).toEqual(['10% (4 to 16) more power than your level before 28 Feb.'])
  })

  it('says holding with how far from level the runs allow, a distance and never under the floor of the range', () => {
    const lines = fitnessLines(
      status('run', 'holding', { change: { value: 0.002, low: -0.03, high: 0.03 }, within: 0.045 }),
      'metric',
    )
    expect(lines.headline).toBe('5:30 /km at 150 bpm.')
    expect(lines.changes).toEqual(['Level with the 36 weeks before, within 4.6%.'])
  })

  it('says holding below as the size off the old level, and a settled rise as the size above it', () => {
    expect(fitnessLines(status('run', 'holding-below'), 'metric').changes).toEqual([
      '10% (5 to 15) off your level before 28 Feb.',
    ])
    expect(fitnessLines(status('run', 'improved', { change: GAIN }), 'metric').changes).toEqual([
      '9% (4 to 14) faster than your level before 28 Feb.',
    ])
  })

  it('says a recovery in two lines, one for the rise from the low and one for the level against the old one', () => {
    const below = fitnessLines(status('run', 'recovering'), 'metric')
    expect(below.headline).toBe('5:30 /km at 150 bpm.')
    expect(below.changes).toEqual([
      'Up 5% (3 to 7) from your July low.',
      '10% (5 to 15) off your level before 28 Feb.',
    ])
    const above = fitnessLines(status('run', 'recovering', { change: GAIN }), 'metric').changes
    expect(above).toEqual([
      'Up 5% (3 to 7) from your July low.',
      '9% (4 to 14) faster than your level before 28 Feb.',
    ])
    // No line holds two ranges.
    for (const line of [...below.changes, ...above]) {
      expect(line.match(/\(/g)).toHaveLength(1)
    }
  })

  it('says back within a tolerance, and back and faster when the whole range is above the old level', () => {
    const level = status('run', 'back', {
      change: { value: 0.004, low: -0.02, high: 0.03 },
      within: 0.034,
    })
    expect(fitnessLines(level, 'metric').changes).toEqual([
      'At your level before 28 Feb, within 3.5%.',
    ])
    const faster = fitnessLines(status('run', 'back', { change: GAIN }), 'metric')
    expect(faster.headline).toBe('5:30 /km at 150 bpm.')
    expect(faster.changes).toEqual(['9% (4 to 14) faster than your level before 28 Feb.'])
    expect(faster.changes.join(' ')).not.toContain('within')
  })

  it('says a rise as a rise and a settled one as the size above the old level', () => {
    const rising = fitnessLines(status('run', 'improving', { change: GAIN }), 'metric')
    expect(rising.changes).toEqual(['9% (4 to 14) faster than your level before 28 Feb.'])
    expect(fitnessFindingHeadline(status('run', 'improved', { change: GAIN }))).toBe(
      '9% (4 to 14) faster than your level before 28 Feb at 150 bpm.',
    )
  })

  it('names the old level by its year when it ended in an earlier year, and as "old" when it is undated', () => {
    const later = { asOfMs: Date.UTC(2026, 3, 12) }
    expect(fitnessLines(status('run', 'slipping', later), 'metric').changes).toEqual([
      '10% (5 to 15) off your 2025 level.',
    ])
    expect(fitnessLines(status('run', 'slipping', { onsetMs: null }), 'metric').changes).toEqual([
      '10% (5 to 15) off your old level.',
    ])
  })

  it('says level, not a direction, when the range of the change reaches both sides of level', () => {
    const across: Ranged = { value: 0.006, low: -0.03, high: 0.04 }
    const at = ['At your level before 28 Feb, within 4.6%.']
    expect(
      fitnessLines(status('run', 'slipping', { change: across, within: 0.045 }), 'metric').changes,
    ).toEqual(at)
    expect(
      fitnessLines(status('run', 'holding-below', { change: across, within: 0.045 }), 'metric')
        .changes,
    ).toEqual(at)
    const recovering = fitnessLines(
      status('run', 'recovering', {
        change: across,
        within: 0.045,
        gain: { value: 0.01, low: -0.02, high: 0.04 },
      }),
      'metric',
    ).changes
    expect(recovering).toEqual(['Up from your July low.', ...at])
    for (const text of recovering) expect(text).not.toMatch(/slower|faster|off|still|%\s\(/)
  })

  it('says "within" as a distance in the athlete\'s terms, the larger side, for a run and a ride', () => {
    const run = fitnessLines(status('run', 'holding', { within: 0.1 }), 'metric').changes
    const ride = fitnessLines(status('ride', 'holding', { within: 0.1 }), 'metric').changes
    // exp(0.1) - 1: a pace 10.5% slower is as far as a speed 9.5% faster, and the larger is said.
    expect(run).toEqual(['Level with the 36 weeks before, within 11%.'])
    expect(ride).toEqual(['Level with the 36 weeks before, within 11%.'])
  })

  it('leads every state with the level and keeps each line to one fact', () => {
    for (const sport of ['run', 'ride'] as const) {
      for (const system of ['metric', 'imperial'] as const) {
        for (const state of STATES) {
          for (const change of [LOSS, GAIN]) {
            const lines = fitnessLines(status(sport, state, { change }), system)
            expect(lines.headline).toMatch(/^\d+(?::\d{2} \/(?:km|mi)| W) at 150 bpm\.$/)
            expect(lines.changes.length).toBeGreaterThan(0)
            for (const line of lines.changes) {
              // One range at most in a line, and no clause joined by a semicolon or a colon.
              expect(line.match(/\(/g)?.length ?? 0).toBeLessThanOrEqual(1)
              expect(line).not.toMatch(/[;:]/)
            }
            const text = [lines.headline, ...lines.changes, lines.support].join(' ')
            expect(lintCopy(text)).toEqual([])
          }
        }
      }
    }
  })
})

describe('the headline of a finding', () => {
  it('carries sizes and dates but no pace or power, which the unit setting would change', () => {
    expect(fitnessFindingHeadline(status('run', 'slipping'))).toBe(
      '10% (5 to 15) off your level before 28 Feb at 150 bpm.',
    )
    expect(
      fitnessFindingHeadline(
        status('ride', 'slipping', { change: { value: -0.06, low: -0.09, high: -0.03 } }),
      ),
    ).toBe('6% (3 to 9) off your level before 28 Feb at 150 bpm.')
    expect(fitnessFindingHeadline(status('ride', 'improved', { change: GAIN }))).toBe(
      '10% (4 to 16) more power than your level before 28 Feb at 150 bpm.',
    )
    expect(fitnessFindingHeadline(status('run', 'recovering'))).toBe(
      'Up 5% (3 to 7) from your low in July at 150 bpm.',
    )
    expect(
      fitnessFindingHeadline(
        status('run', 'back', { change: { value: 0.004, low: -0.02, high: 0.03 }, within: 0.034 }),
      ),
    ).toBe('Back at your level before 28 Feb at 150 bpm, within 3.5%.')
    expect(fitnessFindingHeadline(status('run', 'back', { change: GAIN }))).toBe(
      'Back and 9% (4 to 14) faster than your level before 28 Feb at 150 bpm.',
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
  it('is named when the change began or the low fell in an earlier year than the status is as of, in the lines and the finding', () => {
    const later = status('run', 'recovering', { asOfMs: Date.UTC(2026, 3, 12) })
    expect(fitnessLines(later, 'metric').changes).toEqual([
      'Up 5% (3 to 7) from your 2025 low.',
      '10% (5 to 15) off your 2025 level.',
    ])
    // A finding is kept, so it names the day and the month with their year.
    expect(fitnessFindingHeadline(later)).toBe(
      'Up 5% (3 to 7) from your low in July 2025 at 150 bpm.',
    )
    expect(fitnessFindingHeadline({ ...later, state: 'slipping' })).toBe(
      '10% (5 to 15) off your level before 28 Feb 2025 at 150 bpm.',
    )
  })

  it('is left out in the status’s own year, so a recent date stays short', () => {
    const { changes } = fitnessLines(status('run', 'recovering'), 'metric')
    expect(changes).toEqual([
      'Up 5% (3 to 7) from your July low.',
      '10% (5 to 15) off your level before 28 Feb.',
    ])
    expect(changes.join(' ')).not.toMatch(/2025/)
  })
})

describe('sized', () => {
  it('writes a one-sided range as sizes, the direction left to the words beside it', () => {
    expect(sized('ride', { value: 0.06, low: 0.03, high: 0.09 })).toBe('6% (3 to 9)')
    expect(sized('ride', { value: -0.06, low: -0.09, high: -0.03 })).toBe('6% (3 to 9)')
  })

  it('rounds the size to a whole percentage, with a tenth only under 1%', () => {
    expect(sized('ride', { value: 0.0914, low: 0.05, high: 0.13 })).toBe('9% (5 to 13)')
    expect(sized('ride', { value: 0.004, low: 0.001, high: 0.008 })).toBe('0.4% (0 to 1)')
  })

  it('leaves the range out when it rounds to the size', () => {
    expect(sized('ride', { value: 0.05, low: 0.048, high: 0.052 })).toBe('5%')
  })

  it('keeps the signs of a range that crosses level', () => {
    expect(sized('ride', { value: 0.004, low: -0.03, high: 0.04 })).toBe('0.4% (-3 to +4)')
    expect(sized('ride', { value: -0.01, low: -0.05, high: 0.02 })).toBe('1% (-5 to +2)')
  })
})
