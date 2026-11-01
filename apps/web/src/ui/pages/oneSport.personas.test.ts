import { describe, expect, it } from 'vitest'
import { combine, digestActivity } from '@rca/core/digest'
import { fitnessStatuses } from '@rca/core/fitness'
import type { Period } from '@rca/core/period'
import { persona } from '@rca/core/synthetic'
import type { PersonaName } from '@rca/core/synthetic'
import { fitnessViews } from '../fitnessModel'
import { indoorSplitLine } from '../indoorCopy'
import { hasThreshold } from '../records'
import { soleSportOf } from '../soleSport'
import { thresholdNeedsLine } from '../thresholdNeeds'
import { missingText } from './balanceMissing'

const ALL_TIME: Period = {
  choice: 'all',
  startMs: Date.UTC(2025, 0, 1),
  endMs: Date.UTC(2025, 5, 16),
  days: null,
  fellBack: false,
}

/** What a one-sport Balance says for a persona's library of 14 weeks: its headline, body, the split and whether a fitness card shows. */
function homeOf(name: PersonaName) {
  const digests = persona(name, 1, 14).entries.map((entry) => digestActivity(entry.activity))
  const result = combine(digests, { massKg: 75, bikeMassKg: 9 })
  const sole = soleSportOf(result.activities)!
  const held = missingText(result, result.activities, ALL_TIME, { run: null, ride: null })
  const nowMs = Date.UTC(2025, 5, 16)
  const fitness = fitnessStatuses(digests, new Set(), { nowMs })
  return {
    sole,
    title: held.title,
    detail: held.detail,
    threshold: hasThreshold(result, sole),
    needs: hasThreshold(result, sole) ? null : thresholdNeedsLine(result, sole),
    split: indoorSplitLine(result.activities, sole),
    fitnessCards: fitnessViews(fitness, 'metric').length,
  }
}

/** What each persona's home says, recorded from the generator at seed 1 (a change of wording or of a rule moves a row). */
const EXPECTED = {
  watchRunner: { sole: 'run', title: 'Your running so far', detail: '', split: null, cards: 1 },
  phoneSlowRunner: { sole: 'run', title: 'Your running so far', detail: '', split: null, cards: 1 },
  treadmillHeavy: {
    sole: 'run',
    title: 'Your running so far',
    detail: '',
    split:
      '20 of your 33 runs were on a treadmill; their pace is not used for bests or thresholds.',
    cards: 1,
  },
  treadmillOnly: {
    sole: 'run',
    title: 'Your running so far',
    detail: expect.stringMatching(
      /^All 33 of your runs were on a treadmill\. Their time, distance/,
    ),
    split: null,
    cards: 0,
  },
  ridePower: { sole: 'ride', title: 'Your cycling so far', detail: '', split: null, cards: 1 },
  rideNoPower: {
    sole: 'ride',
    title: 'Your cycling so far',
    detail: '',
    split: null,
    cards: 0,
  },
} as const

describe('a one-sport Balance, by persona', () => {
  it.each(Object.keys(EXPECTED) as (keyof typeof EXPECTED)[])(
    '%s leads with its own sport, never a request',
    (name) => {
      const home = homeOf(name)
      expect(home.title).not.toMatch(/^Add a (run|ride)/)
      expect(home.detail).not.toMatch(/Add a (run|ride)/)
      expect({
        sole: home.sole,
        title: home.title,
        detail: home.detail,
        split: home.split,
        cards: home.fitnessCards,
      }).toEqual(EXPECTED[name])
    },
  )

  it('a treadmill-only runner is told how many runs were on a treadmill, never to add efforts', () => {
    const { needs } = homeOf('treadmillOnly')
    expect(needs).toMatch(/^All \d+ of your runs were on a treadmill\./)
    expect(needs).not.toMatch(/Needs an effort/)
  })
})
