import '../test/warmSample'
import { describe, expect, it } from 'vitest'
import { AnalysisSession } from '@rca/core/session'
import { PRIORS } from '@rca/core/constants'
import { CYCLING_WORLD_CLASS_HOUR_WKG, thresholdRunSpeed } from '@rca/core/digest'
import {
  AGE_RANGE_TEXT,
  NO_DATE_TEXT,
  NO_STANDARD_TEXT,
  THRESHOLD_NO_DATE_TEXT,
  THRESHOLD_NO_STANDARD_TEXT,
  TOP_OF_SCALE_TEXT,
  notGradedText,
} from './grades'
import { SAMPLE_PROFILE, SAMPLE_SETTINGS } from './sampleAthlete'
import { THRESHOLD_NEEDS_TEXT } from './sports'
import { standingOf } from './standing'
import { gradesOfStanding, thresholdGrade } from './thresholdGrade'

const result = new AnalysisSession().loadSample(SAMPLE_SETTINGS).result!

/** The words a sport's outcome gives for having no grade; fails when it is graded. */
function whyNot(outcome: ReturnType<typeof thresholdGrade>): string {
  const words = notGradedText(outcome)
  if (words === null) throw new Error('graded')
  return words
}

describe('thresholdGrade: the words for no grade', () => {
  it('says the strongest effort behind the threshold cannot be dated, in the threshold’s words', () => {
    const undated = { ...result, activities: [] }
    for (const sport of ['run', 'ride'] as const) {
      const words = whyNot(thresholdGrade(undated, sport, SAMPLE_PROFILE))
      expect(words).toBe(THRESHOLD_NO_DATE_TEXT)
      expect(words).not.toBe(NO_DATE_TEXT)
    }
  })

  it('says the ages the grades cover when the day falls outside them', () => {
    const unborn = { birthYear: 3000, sex: 'male' } as const
    for (const sport of ['run', 'ride'] as const) {
      expect(whyNot(thresholdGrade(result, sport, unborn))).toBe(AGE_RANGE_TEXT)
    }
  })

  it('says the threshold has no age standard where its hour has none to grade it', () => {
    // A ride with no running equivalent, and a run slower than the shortest standard's distance in an hour.
    const noEquivalent = { ...result, rideThresholdRunSpeed: null }
    const walking = { ...result.runThreshold!, value: 2.8, low: 2.8, high: 2.8 }
    const slowRun = { ...result, runThreshold: walking }
    const words = [
      whyNot(thresholdGrade(noEquivalent, 'ride', SAMPLE_PROFILE)),
      whyNot(thresholdGrade(slowRun, 'run', SAMPLE_PROFILE)),
    ]
    expect(words).toEqual([THRESHOLD_NO_STANDARD_TEXT, THRESHOLD_NO_STANDARD_TEXT])
    expect(words[0]).not.toBe(NO_STANDARD_TEXT)
  })

  it('asks for the effort the sport lacks when it has no threshold, and says nothing without a profile', () => {
    // No activities on file, so no sport has an indoor-only history to name instead.
    const bare = {
      ...result,
      activities: [],
      runThreshold: null,
      rideThreshold: null,
      rideThresholdRunSpeed: null,
    }
    for (const sport of ['run', 'ride'] as const) {
      expect(whyNot(thresholdGrade(bare, sport, SAMPLE_PROFILE))).toBe(THRESHOLD_NEEDS_TEXT[sport])
    }
    const unprofiled = gradesOfStanding(result, standingOf(result, null))
    expect([whyNot(unprofiled.run), whyNot(unprofiled.ride)]).toEqual(['', ''])
  })

  it('leaves a ride at the cycling world-class hour at the top of the scale, in the page’s words', () => {
    const wkg = CYCLING_WORLD_CLASS_HOUR_WKG.male / PRIORS.grossEfficiency.mean
    const top = { ...result.rideThreshold!, value: wkg, low: wkg, high: wkg }
    const strong = {
      ...result,
      rideThreshold: top,
      rideThresholdRunSpeed: thresholdRunSpeed(top, 'male'),
    }
    const outcome = thresholdGrade(strong, 'ride', SAMPLE_PROFILE)
    expect(outcome.kind).toBe('top-of-scale')
    expect(notGradedText(outcome)).toBe(TOP_OF_SCALE_TEXT)
  })
})
