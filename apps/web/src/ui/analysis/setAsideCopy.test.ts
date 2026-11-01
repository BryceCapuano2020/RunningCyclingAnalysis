import { describe, expect, it } from 'vitest'
import type { HeartRateJudgement } from '@rca/core/digest/setAsideTypes'
import { NO_HEART_RATE_JUDGEMENT } from '@rca/core/digest/setAsideTypes'
import { NO_EFFORT_REFERENCE } from '@rca/core/effort'
import { makeActivity, makeResult } from '../components/fixtures'
import { setAsideActivityText, setAsideText } from './setAsideCopy'

/** A library judged against 200 bpm running and 194 bpm cycling. */
const JUDGED: HeartRateJudgement = {
  setAside: ['n1', 'r1', 'r2'],
  referenceHr: { run: 200.4, ride: 194 },
  observedMaxHr: { run: 200.4, ride: 188 },
  observedMaxSource: { run: null, ride: null },
  effortReference: NO_EFFORT_REFERENCE,
  fit: { run: null, ride: null },
  thresholdTimeline: { run: [], ride: [] },
  threshold: { run: 5, ride: 4 },
  calibration: null,
  rideGate: null,
}

describe('set-aside heart rate copy', () => {
  it('says nothing when no heart rate is set aside', () => {
    expect(setAsideText(makeResult(), JUDGED)).toBeNull()
  })

  const activities = [
    makeActivity({ id: 'r1', sport: 'ride' }),
    makeActivity({ id: 'r2', sport: 'ride' }),
    makeActivity({ id: 'n1', sport: 'run' }),
    makeActivity({ id: 'kept', sport: 'ride' }),
  ]

  it('counts the runs and rides whose heart rate is left out, and gives the rule with the library’s max heart rate', () => {
    const text = setAsideText(
      makeResult({ activities, heartRateSetAside: ['n1', 'r1', 'r2'] }),
      JUDGED,
    )
    expect(text).toBe(
      'Heart rate is left out of 1 run and 2 rides. On each, heart rate stayed under 70% of your ' +
        'max heart rate across all your activities (200 bpm running, 194 bpm cycling) for 10 min or ' +
        'more at or above your threshold, or was too low for the power.',
    )
  })

  it('cites only the reference of the sports it names', () => {
    const text = setAsideText(makeResult({ activities, heartRateSetAside: ['r1'] }), JUDGED)
    expect(text).toContain('across all your activities (194 bpm cycling)')
    expect(text).not.toContain('running')
  })

  it('names the same rule on the activity, with that sport’s max heart rate', () => {
    expect(setAsideActivityText('run', JUDGED)).toBe(
      "We left this activity's heart rate out of the heart-rate and effort checks. Its heart rate " +
        'stayed under 70% of your max heart rate across all your activities (200 bpm running) for 10 ' +
        'min or more at or above your threshold, or was too low for the power.',
    )
  })

  it('gives the rule without a max heart rate when the judgement holds none', () => {
    expect(setAsideActivityText('ride', NO_HEART_RATE_JUDGEMENT)).toBe(
      "We left this activity's heart rate out of the heart-rate and effort checks. Its heart rate " +
        'stayed under 70% of your max heart rate for 10 min or more at or above your threshold, or ' +
        'was too low for the power.',
    )
  })
})
