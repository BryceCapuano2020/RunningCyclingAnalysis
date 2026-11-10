import { describe, expect, it } from 'vitest'
import { lintCopy } from '../findings/copy'
import { fitnessLines, withinText } from './copy'
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
  it('says the level first, then what it rests on, whatever the state', () => {
    const lines = fitnessLines(status('run', 'holding'), 'metric')
    expect(lines).toEqual({
      headline: '5:30 /km at 150 bpm.',
      support: 'From 14 steady runs, 14 Apr to 8 Jun.',
      needs: '',
    })
  })

  it('writes pace per mile when the athlete counts in miles', () => {
    const lines = fitnessLines(status('run', 'holding'), 'imperial')
    expect(lines.headline).toMatch(/^8:\d\d \/mi at 150 bpm\.$/)
    expect(lines.headline).not.toContain('/km')
  })

  it('says rides in watts', () => {
    const lines = fitnessLines(status('ride', 'holding', { referenceHr: 140 }), 'imperial')
    expect(lines.headline).toBe('172 W at 140 bpm.')
  })

  it('says "within" as a distance in the athlete\'s terms, the larger side, for a run and a ride', () => {
    // exp(0.1) - 1: a pace 10.5% slower is as far as a speed 9.5% faster, and the larger is said.
    expect(withinText('run', 0.1)).toBe('11%')
    expect(withinText('ride', 0.1)).toBe('11%')
  })

  it('leads every state with the level and passes the copy lint', () => {
    for (const sport of ['run', 'ride'] as const) {
      for (const system of ['metric', 'imperial'] as const) {
        for (const state of STATES) {
          for (const change of [LOSS, GAIN]) {
            const lines = fitnessLines(status(sport, state, { change }), system)
            expect(lines.headline).toMatch(/^\d+(?::\d{2} \/(?:km|mi)| W) at 150 bpm\.$/)
            expect(lintCopy([lines.headline, lines.support].join(' '))).toEqual([])
          }
        }
      }
    }
  })
})
