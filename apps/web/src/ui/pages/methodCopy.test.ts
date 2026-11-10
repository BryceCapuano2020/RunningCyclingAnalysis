import { describe, expect, it } from 'vitest'
import { DURATION_TABLES, HALF_LIFE_DAYS } from '@rca/core/threshold'
import { HABITUAL_MIN_DAYS, HIGH_OVER_PREDICTED_BPM } from '@rca/core/effort'
import {
  ENERGY_FACTS,
  ENERGY_LEAD,
  HEART_FACTS,
  HEART_LEAD,
  RACE_FACTS,
  THRESHOLD_FACTS,
  THRESHOLD_LEAD,
  VIRTUAL_FACTS,
  VIRTUAL_LEAD,
} from './methodCopy'
import { LIFT_FACTS, LIFT_GRADE_FACTS, LIFT_GRADE_LEAD, LIFT_LEAD } from './liftMethodCopy'

const ALL = [
  THRESHOLD_LEAD,
  ...THRESHOLD_FACTS,
  ...RACE_FACTS,
  ENERGY_LEAD,
  ...ENERGY_FACTS,
  ...HEART_FACTS,
  VIRTUAL_LEAD,
  ...VIRTUAL_FACTS,
  LIFT_LEAD,
  ...LIFT_FACTS,
  LIFT_GRADE_LEAD,
  ...LIFT_GRADE_FACTS,
]

/** A sentence ends at a full stop followed by a space and a capital; a line may hold a decimal point. */
const SENTENCE_END = /(?<=[a-z)%\]])\. (?=[A-Z])/

describe('the Method section copy', () => {
  it('keeps each fact one sentence of 25 words or fewer, ending in a full stop', () => {
    for (const line of [...ALL.filter((line) => line !== HEART_LEAD)]) {
      expect(line.split(SENTENCE_END).length, line).toBe(1)
      expect(line.split(/\s+/).length, line).toBeLessThanOrEqual(25)
      expect(line, line).toMatch(/\.$/)
    }
  })

  it('uses none of the words the app avoids, no hedge and no em dash', () => {
    const copy = ALL.join(' ')
    expect(copy).not.toMatch(
      /\b(limiter|weak|strength|ahead of|quietly|because|caused|may|might|approximately)\b/i,
    )
    expect(copy).not.toMatch(/holding you back|important to note/i)
    expect(copy).not.toContain('—')
  })

  it('takes the threshold’s numbers from core’s tables, not from typed copies', () => {
    const copy = THRESHOLD_FACTS.join(' ')
    expect(copy).toContain(`from ${DURATION_TABLES.ride.shortestS / 60} min for a ride`)
    expect(copy).toContain(`or ${DURATION_TABLES.run.shortestS / 60} min for a run`)
    expect(copy).toContain(`${Math.round(DURATION_TABLES.ride.threshold(100, 1200))}% of it`)
    expect(copy).toContain(`halves every ${HALF_LIFE_DAYS} days`)
    expect(copy).toMatch(/raise a ride’s threshold, never lower it/)
  })

  it('says what the half marathon on Balance rests on, and how sure it is', () => {
    const copy = RACE_FACTS.join(' ')
    expect(copy).toContain('predicted half marathon')
    expect(copy).toContain('from the mile up with VO2max from heart rate')
    expect(copy).toContain('a 5.5% spread for the half')
    expect(copy).toContain('never slower than one you have run')
  })

  it('names functional threshold power where it says what a threshold is', () => {
    expect(THRESHOLD_LEAD).toContain('functional threshold power for a ride')
  })

  it('says when a max heart rate falls back to the age, and when it cannot call an effort hard', () => {
    const copy = HEART_FACTS.join(' ')
    expect(copy).toContain(`With under ${HABITUAL_MIN_DAYS} days of heart rate`)
    expect(copy).toContain(`${HIGH_OVER_PREDICTED_BPM} bpm over its usual max`)
  })
})
